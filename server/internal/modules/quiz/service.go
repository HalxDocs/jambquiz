package quiz

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/274lab/server/internal/access"
	"github.com/274lab/server/internal/ratelimit"
	"github.com/274lab/server/pkg/ids"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound    = errors.New("not found")
	ErrForbidden   = errors.New("forbidden")
	ErrLocked      = errors.New("quiz is locked")
	ErrExpired     = errors.New("subscription expired")
	ErrSuspended   = errors.New("account suspended")
	ErrRateLimited = errors.New("too many requests")
	ErrDeadline    = errors.New("time is up")
	ErrMalformed   = errors.New("malformed answers")
	ErrNoQuestions = errors.New("no questions available")
	ErrNoSubjects  = errors.New("no subjects enrolled")
	ErrNotSuccess  = errors.New("payment not successful yet")
)

type Service struct {
	pool *pgxpool.Pool
	// OnSubmit fires best-effort after a successful submit (e.g. realtime SMS).
	OnSubmit func(ctx context.Context, studentID, week string, results []SubjectResult)
}

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

var weekSanitize = regexp.MustCompile(`[^a-zA-Z0-9_-]`)

func sanitizeWeek(week string) string {
	s := weekSanitize.ReplaceAllString(week, "_")
	if len(s) > 50 {
		s = s[:50]
	}
	return s
}

// rateLimit is a fixed-window throttle backed by rate_limits (fail-open).
func (s *Service) rateLimit(ctx context.Context, key string, max int, windowMs int64) bool {
	return ratelimit.Allow(ctx, s.pool, key, max, windowMs)
}

// wat is West Africa Time. Fixed UTC+1 with no DST, so a literal zone avoids
// depending on tzdata being present in the container.
var wat = time.FixedZone("WAT", 1*60*60)

type quizDates struct {
	Date1 string `json:"date1"`
	Date2 string `json:"date2"`
	// OpenFrom/OpenUntil extend access beyond the two 2h slots, so an admin
	// can open a week for a multi-day window (free week, catch-up) without
	// changing the date1/date2 fields the admin panel still writes.
	OpenFrom  string `json:"openFrom"`
	OpenUntil string `json:"openUntil"`
}

func (s *Service) getQuizDates(ctx context.Context, week string) quizDates {
	var data []byte
	key := "quizDates_" + sanitizeWeek(week)
	if err := s.pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = $1`, key).Scan(&data); err != nil {
		return quizDates{}
	}
	var qd quizDates
	_ = json.Unmarshal(data, &qd)
	return qd
}

// windowOpen mirrors the Node engine: either scheduled date within its 2h slot,
// or inside an explicit openFrom/openUntil span when the admin has set one.
func windowOpen(qd quizDates, now time.Time) bool {
	if from, ok := parseSlot(qd.OpenFrom); ok {
		if until, ok := parseSlot(qd.OpenUntil); ok {
			if !now.Before(from) && now.Before(until) {
				return true
			}
		}
	}
	for _, d := range []string{qd.Date1, qd.Date2} {
		if d == "" {
			continue
		}
		start, err := time.Parse(time.RFC3339, d)
		if err != nil {
			continue
		}
		if !now.Before(start) && now.Before(start.Add(2*time.Hour)) {
			return true
		}
	}
	return false
}

func parseSlot(d string) (time.Time, bool) {
	if d == "" {
		return time.Time{}, false
	}
	t, err := time.Parse(time.RFC3339, d)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}

// isStandardWindowDate reports whether a scheduled slot falls inside the normal
// weekend window (Fri/Sat/Sun, 17:00-19:00). Slots are stored in UTC but the
// window is quoted in West Africa Time, so compare in WAT (UTC+1). Comparing in
// UTC made every slot look like 16:00 and classified all weeks as bonus.
func isStandardWindowDate(d string) bool {
	t, err := time.Parse(time.RFC3339, d)
	if err != nil {
		return false
	}
	t = t.In(wat)
	day := t.Weekday()
	if day != time.Sunday && day != time.Friday && day != time.Saturday {
		return false
	}
	mins := t.Hour()*60 + t.Minute()
	return mins >= 17*60 && mins < 19*60
}

// isBonus mirrors the client: scheduled dates all outside the normal weekend
// window means free practice that never consumes trial.
func isBonus(qd quizDates) bool {
	dates := []string{}
	for _, d := range []string{qd.Date1, qd.Date2} {
		if d != "" {
			dates = append(dates, d)
		}
	}
	if len(dates) == 0 {
		return false
	}
	for _, d := range dates {
		if isStandardWindowDate(d) {
			return false
		}
	}
	return true
}

func (s *Service) correctionsReleased(ctx context.Context, week string, qd quizDates, now time.Time) bool {
	var one int
	if err := s.pool.QueryRow(ctx, `SELECT 1 FROM admin_settings WHERE id = $1`,
		"corrections_released_"+sanitizeWeek(week)).Scan(&one); err == nil {
		return true
	}
	return !windowOpen(qd, now)
}

func (s *Service) studentAccess(ctx context.Context, studentID string, now time.Time) (access.Student, []string, string, error) {
	var a access.Student
	var subjects []string
	var uid string
	var subUntil, trialStart, joined *time.Time
	var suspended bool
	var freeUsed int
	err := s.pool.QueryRow(ctx, `SELECT COALESCE(uid,''), subjects, suspended, subscription_until,
		free_attempts_used, trial_started_at, joined_at FROM students WHERE id = $1`, studentID,
	).Scan(&uid, &subjects, &suspended, &subUntil, &freeUsed, &trialStart, &joined)
	if err != nil {
		return a, nil, "", ErrNotFound
	}
	a = access.Student{Suspended: suspended, SubscriptionUntil: subUntil,
		FreeAttemptsUsed: freeUsed, TrialStartedAt: trialStart, JoinedAt: joined}
	return a, subjects, uid, nil
}

// --- Start ---

type StartResult struct {
	SessionID string                      `json:"sessionId"`
	Week      string                      `json:"week"`
	IsRetake  bool                        `json:"isRetake"`
	Questions map[string][]PublicQuestion `json:"questions"`
}

type PublicQuestion struct {
	ID           string   `json:"id"`
	Passage      string   `json:"passage"`
	Question     string   `json:"question"`
	Options      []string `json:"options"`
	Image        string   `json:"image"`
	OptionImages []string `json:"optionImages"`
}

func (s *Service) Start(ctx context.Context, authUID, studentID, week, retakeSubject string) (StartResult, error) {
	var out StartResult
	now := time.Now().UTC()
	if !s.rateLimit(ctx, "startQuiz:"+authUID, 20, 60*60*1000) {
		return out, ErrRateLimited
	}
	acc, enrolled, _, err := s.studentAccess(ctx, studentID, now)
	if err != nil {
		return out, err
	}
	// Ownership is the Go student id (the JWT subject). The students.uid column
	// is a leftover Firebase Auth uid: for accounts migrated from Firebase it
	// holds a value that can never equal the Go id, so comparing it here
	// rejected every legacy student with "forbidden" while newer accounts,
	// whose uid is empty, sailed through. The handler already rejects a
	// mismatched studentId for non-admins.
	status := access.For(acc, now)
	if status.Status == "suspended" {
		return out, ErrSuspended
	}
	isRetake := retakeSubject != ""
	qd := s.getQuizDates(ctx, week)
	bonus := !isRetake && isBonus(qd)
	if status.Status == "expired" && !bonus {
		return out, ErrExpired
	}
	if !isRetake && !windowOpen(qd, now) {
		return out, ErrLocked
	}

	subjects := enrolled
	if isRetake {
		subjects = []string{retakeSubject}
	}
	if len(subjects) == 0 {
		return out, ErrNoSubjects
	}

	assignments := map[string][]string{}
	questions := map[string][]PublicQuestion{}
	for _, subject := range subjects {
		rows, err := s.pool.Query(ctx, `SELECT id FROM questions WHERE subject = $1 AND week = $2`, subject, week)
		if err != nil {
			return out, err
		}
		bank := []string{}
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err == nil {
				bank = append(bank, id)
			}
		}
		rows.Close()
		if len(bank) == 0 {
			continue
		}
		limit := s.questionLimit(ctx, subject, week)
		picked := PickQuestions(bank, limit, authUID+"|"+week+"|"+subject)
		if len(picked) == 0 {
			continue
		}
		assignments[subject] = picked
		qs := []PublicQuestion{}
		for _, qid := range picked {
			var q PublicQuestion
			var options []byte
			var optImgs []byte
			err := s.pool.QueryRow(ctx, `SELECT id, question, passage, options, image, option_images
				FROM questions WHERE id = $1`, qid).Scan(&q.ID, &q.Question, &q.Passage, &options, &q.Image, &optImgs)
			if err != nil {
				continue
			}
			_ = json.Unmarshal(options, &q.Options)
			_ = json.Unmarshal(optImgs, &q.OptionImages)
			if q.Options == nil {
				q.Options = []string{}
			}
			qs = append(qs, q)
		}
		questions[subject] = qs
	}
	if len(assignments) == 0 {
		return out, fmt.Errorf("%w for %s", ErrNoQuestions, week)
	}

	assignJSON, _ := json.Marshal(assignments)
	sessionID := newID()
	deadline := now.Add(time.Hour)
	if _, err := s.pool.Exec(ctx, `INSERT INTO quiz_sessions
		(id, uid, student_id, week, is_retake, assignments, status, started_at, deadline)
		VALUES ($1,$2,$3,$4,$5,$6,'started',$7,$8)`,
		sessionID, authUID, studentID, week, isRetake, assignJSON, now, deadline); err != nil {
		return out, err
	}
	return StartResult{SessionID: sessionID, Week: week, IsRetake: isRetake, Questions: questions}, nil
}

func (s *Service) questionLimit(ctx context.Context, subject, week string) int {
	def := 25
	if subject == "English Language" {
		def = 40
	}
	var lim int
	if err := s.pool.QueryRow(ctx, `SELECT "limit" FROM question_limits WHERE subject = $1 AND week = $2`,
		subject, week).Scan(&lim); err != nil || lim < 1 {
		return def
	}
	if lim > 200 {
		return 200
	}
	return lim
}

// --- Submit ---

type SubjectResult struct {
	Subject    string `json:"subject"`
	Week       string `json:"week"`
	Score      int    `json:"score"`
	OutOf      int    `json:"outOf"`
	Correct    int    `json:"correct"`
	Wrong      int    `json:"wrong"`
	Unanswered int    `json:"unanswered"`
	Total      int    `json:"total"`
	Released   bool   `json:"released"`
}

type SubmitResult struct {
	Results          []SubjectResult `json:"results"`
	ScoreID          string          `json:"scoreId"`
	AlreadySubmitted bool            `json:"alreadySubmitted,omitempty"`
	EarnedCoins      *int            `json:"earnedCoins,omitempty"`
}

func (s *Service) Submit(ctx context.Context, authUID, sessionID string, answers map[string][]int) (SubmitResult, error) {
	var out SubmitResult
	now := time.Now().UTC()

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return out, err
	}
	defer tx.Rollback(ctx)

	var studentID, week, sessionUID, status string
	var isRetake bool
	var assignJSON []byte
	var deadline time.Time
	var storedResults []byte
	err = tx.QueryRow(ctx, `SELECT student_id, week, uid, is_retake, assignments, status, deadline,
		COALESCE(results, '[]') FROM quiz_sessions WHERE id = $1 FOR UPDATE`, sessionID,
	).Scan(&studentID, &week, &sessionUID, &isRetake, &assignJSON, &status, &deadline, &storedResults)
	if err != nil {
		return out, ErrNotFound
	}
	// Compare against the session's student_id rather than its uid column:
	// sessions created before the cutover stored the legacy Firebase uid,
	// which would refuse the owner's own submission.
	if studentID != authUID {
		return out, ErrForbidden
	}
	if status == "submitted" {
		var results []SubjectResult
		_ = json.Unmarshal(storedResults, &results)
		if results == nil {
			results = []SubjectResult{}
		}
		return SubmitResult{Results: results, AlreadySubmitted: true}, nil
	}
	if now.After(deadline) {
		return out, ErrDeadline
	}

	var assignments map[string][]string
	if err := json.Unmarshal(assignJSON, &assignments); err != nil {
		return out, ErrMalformed
	}

	qd := s.getQuizDates(ctx, week)
	released := s.correctionsReleased(ctx, week, qd, now)

	results := []SubjectResult{}
	type scoreRow struct {
		id                                       string
		subject                                  string
		score, correct, wrong, unanswered, total int
	}
	scores := []scoreRow{}
	detailSubjects := []map[string]any{}
	detailAnswers := []map[string]any{}

	for subject, qids := range assignments {
		sub, ok := answers[subject]
		if !ok || len(sub) != len(qids) {
			return out, fmt.Errorf("%w for %s", ErrMalformed, subject)
		}
		key := make([]int, len(qids))
		for i, qid := range qids {
			var ans int
			if err := tx.QueryRow(ctx, `SELECT answer FROM question_answers WHERE question_id = $1`, qid).Scan(&ans); err != nil {
				ans = -1
			}
			key[i] = ans
		}
		g := GradeSubject(key, sub)
		results = append(results, SubjectResult{Subject: subject, Week: week, Score: g.Score,
			OutOf: 100, Correct: g.Correct, Wrong: g.Wrong, Unanswered: g.Unanswered, Total: g.Total, Released: released})
		sid := newID()
		scores = append(scores, scoreRow{id: sid, subject: subject, score: g.Score,
			correct: g.Correct, wrong: g.Wrong, unanswered: g.Unanswered, total: g.Total})

		// Correction content (stored without the key; key served via details).
		qcontent := []map[string]any{}
		for _, qid := range qids {
			var question, explanation, image string
			var options, optImgs []byte
			var explImg string
			var passage string
			_ = tx.QueryRow(ctx, `SELECT question, passage, options, explanation, image, option_images, explanation_image
				FROM questions WHERE id = $1`, qid).Scan(&question, &passage, &options, &explanation, &image, &optImgs, &explImg)
			var opts, oimgs []any
			_ = json.Unmarshal(options, &opts)
			_ = json.Unmarshal(optImgs, &oimgs)
			qcontent = append(qcontent, map[string]any{
				"id": qid, "question": question, "passage": passage, "options": opts, "answer": nil,
				"explanation": explanation, "image": image, "optionImages": oimgs, "explanationImage": explImg,
			})
		}
		detailSubjects = append(detailSubjects, map[string]any{"subject": subject, "questions": qcontent})
		subInts := make([]any, len(sub))
		for i, v := range sub {
			subInts[i] = v
		}
		detailAnswers = append(detailAnswers, map[string]any{"subject": subject, "answers": subInts})
	}

	var studentName, studentUID string
	var studentCoins int
	if err := tx.QueryRow(ctx, `SELECT name, COALESCE(uid,''), coins FROM students WHERE id = $1`, studentID).Scan(&studentName, &studentUID, &studentCoins); err != nil {
		return out, ErrNotFound
	}

	for _, sc := range scores {
		if _, err := tx.Exec(ctx, `INSERT INTO scores
			(id, student_id, uid, student_name, subject, week, score, out_of, correct, wrong, unanswered, total, is_retake, date)
			VALUES ($1,$2,$3,$4,$5,$6,$7,100,$8,$9,$10,$11,$12,$13)`,
			sc.id, studentID, authUID, studentName, sc.subject, week, sc.score,
			sc.correct, sc.wrong, sc.unanswered, sc.total, isRetake, now); err != nil {
			return out, err
		}
	}
	detailID := studentID + "_" + strings.ReplaceAll(week, " ", "_")
	subjJSON, _ := json.Marshal(detailSubjects)
	ansJSON, _ := json.Marshal(detailAnswers)
	if _, err := tx.Exec(ctx, `INSERT INTO score_details (id, student_id, uid, week, subjects, answers)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (id) DO UPDATE SET subjects = $5, answers = $6, updated_at = now()`,
		detailID, studentID, authUID, week, subjJSON, ansJSON); err != nil {
		return out, err
	}

	scoreIDs := make([]string, len(scores))
	for i, sc := range scores {
		scoreIDs[i] = sc.id
	}
	resultsJSON, _ := json.Marshal(results)
	if _, err := tx.Exec(ctx, `UPDATE quiz_sessions SET status='submitted', submitted_at=$1,
		results=$2, score_ids=$3 WHERE id=$4`, now, resultsJSON, scoreIDs, sessionID); err != nil {
		return out, err
	}

	if !isRetake {
		earned := studentCoins + 10
		if _, err := tx.Exec(ctx, `UPDATE students SET coins=$1, updated_at=now() WHERE id=$2`, earned, studentID); err != nil {
			return out, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO coin_ledger (id, student_id, uid, delta, reason, ref)
			VALUES ($1,$2,$3,10,'test_complete',$4)`, newID(), studentID, studentUID, detailID); err != nil {
			return out, err
		}
		out.EarnedCoins = &earned
	}

	if err := tx.Commit(ctx); err != nil {
		return out, err
	}

	// Aggregates are best-effort (never fail the submit).
	s.updateAggregates(ctx, studentID, week, results)

	// Realtime SMS hook (never fails the submit).
	if s.OnSubmit != nil {
		func() {
			defer func() { _ = recover() }()
			s.OnSubmit(ctx, studentID, week, results)
		}()
	}

	out.Results = results
	out.ScoreID = detailID
	return out, nil
}

func (s *Service) updateAggregates(ctx context.Context, studentID, week string, results []SubjectResult) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx)
	var name, nickname, year string
	var subjects []string
	if err := tx.QueryRow(ctx, `SELECT name, nickname, year, subjects FROM students WHERE id=$1`, studentID).Scan(&name, &nickname, &year, &subjects); err != nil {
		return
	}
	var bestJSON, sessJSON, weeksJSON []byte
	_ = tx.QueryRow(ctx, `SELECT best_by_subject, sessions, weeks FROM leaderboard_student_ranks WHERE student_id=$1`,
		studentID).Scan(&bestJSON, &sessJSON, &weeksJSON)
	best := map[string]map[string]int{}
	sess := map[string]bool{}
	weeks := map[string]bool{}
	_ = json.Unmarshal(nullJSON(bestJSON, "{}"), &best)
	_ = json.Unmarshal(nullJSON(sessJSON, "{}"), &sess)
	_ = json.Unmarshal(nullJSON(weeksJSON, "{}"), &weeks)
	for _, r := range results {
		if cur, ok := best[r.Subject]; !ok || r.Score > cur["score"] {
			best[r.Subject] = map[string]int{"score": r.Score, "outOf": 100}
		}
		sess[week+"::"+r.Subject] = true
	}
	weeks[week] = true
	top := []int{}
	for _, v := range best {
		top = append(top, v["score"])
	}
	for i := 0; i < len(top); i++ {
		for j := i + 1; j < len(top); j++ {
			if top[j] > top[i] {
				top[i], top[j] = top[j], top[i]
			}
		}
	}
	total := 0
	if len(best) >= 4 {
		for i := 0; i < 4 && i < len(top); i++ {
			total += top[i]
		}
	}
	bestOut, _ := json.Marshal(best)
	sessOut, _ := json.Marshal(sess)
	weeksOut, _ := json.Marshal(weeks)
	qualified := len(best) >= 4
	_, err = tx.Exec(ctx, `INSERT INTO leaderboard_student_ranks
		(student_id, name, nickname, year, subjects, best_by_subject, sessions, weeks, total, session_count, gold_medals, qualified, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
		ON CONFLICT (student_id) DO UPDATE SET name=$2, nickname=$3, year=$4, subjects=$5,
		best_by_subject=$6, sessions=$7, weeks=$8, total=$9, session_count=$10, gold_medals=$11, qualified=$12, updated_at=now()`,
		studentID, name, nickname, year, subjects, bestOut, sessOut, weeksOut,
		total, len(sess), len(weeks), qualified)
	if err != nil {
		return
	}
	// Week total = best score per subject for that week, summed, read back
	// from the scores table. Using just this session's results (the previous
	// behaviour) overwrote the week total and dropped earlier subjects; summing
	// every attempt instead (as the rebuild did) counted retakes repeatedly.
	var weekTotal, weekSubjects int
	err = tx.QueryRow(ctx, `SELECT COALESCE(SUM(best),0), COUNT(*) FROM (
			SELECT MAX(score) AS best FROM scores
			WHERE student_id=$1 AND week=$2 GROUP BY subject) x`,
		studentID, week).Scan(&weekTotal, &weekSubjects)
	if err != nil {
		return
	}
	weekID := studentID + "_" + strings.ReplaceAll(week, " ", "_")
	_, err = tx.Exec(ctx, `INSERT INTO leaderboard_week_ranks
		(id, student_id, week, name, nickname, total, session_count, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,now())
		ON CONFLICT (id) DO UPDATE SET total=$6, session_count=$7, name=$4, nickname=$5, updated_at=now()`,
		weekID, studentID, week, name, nickname, weekTotal, weekSubjects)
	if err != nil {
		return
	}
	_ = tx.Commit(ctx)
}

func nullJSON(b []byte, fallback string) []byte {
	if len(b) == 0 {
		return []byte(fallback)
	}
	return b
}

// --- Details ---

type DetailsResult struct {
	Released bool             `json:"released"`
	Subjects []map[string]any `json:"subjects"`
	Answers  []map[string]any `json:"answers"`
}

func (s *Service) Details(ctx context.Context, authUID, authRole, studentID, week string) (DetailsResult, error) {
	var out DetailsResult
	out.Subjects = []map[string]any{}
	out.Answers = []map[string]any{}
	var exists bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM students WHERE id=$1)`, studentID).Scan(&exists); err != nil {
		return out, ErrNotFound
	}
	if !exists {
		return out, ErrNotFound
	}
	if authRole != "admin" && studentID != authUID {
		return out, ErrForbidden
	}
	qd := s.getQuizDates(ctx, week)
	if !s.correctionsReleased(ctx, week, qd, time.Now().UTC()) {
		return out, nil
	}
	out.Released = true
	detailID := studentID + "_" + strings.ReplaceAll(week, " ", "_")
	var subjJSON, ansJSON []byte
	if err := s.pool.QueryRow(ctx, `SELECT subjects, answers FROM score_details WHERE id=$1`, detailID).Scan(&subjJSON, &ansJSON); err != nil {
		return out, nil
	}
	var subjects []map[string]any
	var answers []map[string]any
	_ = json.Unmarshal(subjJSON, &subjects)
	_ = json.Unmarshal(ansJSON, &answers)

	// Attach the answer key server-side (never stored in score_details).
	keyByQ := map[string]int{}
	rows, err := s.pool.Query(ctx, `SELECT qa.question_id, qa.answer FROM question_answers qa
		JOIN questions q ON q.id = qa.question_id WHERE q.week = $1`, week)
	if err == nil {
		for rows.Next() {
			var qid string
			var ans int
			if err := rows.Scan(&qid, &ans); err == nil {
				keyByQ[qid] = ans
			}
		}
		rows.Close()
	}
	for _, sub := range subjects {
		qs, _ := sub["questions"].([]any)
		for _, q := range qs {
			if qm, ok := q.(map[string]any); ok {
				if id, ok := qm["id"].(string); ok {
					if a, ok := keyByQ[id]; ok {
						qm["answer"] = a
					} else {
						qm["answer"] = -1
					}
				}
			}
		}
	}
	out.Subjects = subjects
	if answers != nil {
		out.Answers = answers
	}
	return out, nil
}

// --- Trial ---

type TrialResult struct {
	Consumed         bool `json:"consumed"`
	FreeAttemptsUsed int  `json:"freeAttemptsUsed"`
}

func (s *Service) ConsumeTrial(ctx context.Context, authUID, studentID string) (TrialResult, error) {
	var out TrialResult
	if !s.rateLimit(ctx, "consumeFree:"+authUID, 20, 60*60*1000) {
		return out, ErrRateLimited
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return out, err
	}
	defer tx.Rollback(ctx)
	var ownerUID string
	var used int
	if err := tx.QueryRow(ctx, `SELECT COALESCE(uid,''), free_attempts_used FROM students WHERE id=$1 FOR UPDATE`, studentID).Scan(&ownerUID, &used); err != nil {
		return out, ErrNotFound
	}
	_ = ownerUID // legacy Firebase uid; ownership is the student id, not this
	if studentID != authUID {
		return out, ErrForbidden
	}
	out.FreeAttemptsUsed = used
	if used >= 2 {
		if err := tx.Commit(ctx); err != nil {
			return out, err
		}
		return out, nil
	}
	now := time.Now().UTC()
	if used == 0 {
		_, err = tx.Exec(ctx, `UPDATE students SET free_attempts_used=1, trial_started_at=$1, updated_at=now() WHERE id=$2`, now, studentID)
	} else {
		_, err = tx.Exec(ctx, `UPDATE students SET free_attempts_used=free_attempts_used+1, updated_at=now() WHERE id=$1`, studentID)
	}
	if err != nil {
		return out, err
	}
	if err := tx.Commit(ctx); err != nil {
		return out, err
	}
	out.Consumed = true
	out.FreeAttemptsUsed = used + 1
	return out, nil
}

func newID() string { return ids.New() }

// Score is a score row with corrections merged (mirrors fetchDetails).
type Score struct {
	ID          string `json:"id"`
	StudentID   string `json:"studentId"`
	StudentName string `json:"studentName"`
	Subject     string `json:"subject"`
	Week        string `json:"week"`
	Score       int    `json:"score"`
	OutOf       int    `json:"outOf"`
	Correct     int    `json:"correct"`
	Wrong       int    `json:"wrong"`
	Unanswered  int    `json:"unanswered"`
	Total       int    `json:"total"`
	IsRetake    bool   `json:"isRetake"`
	CreatedAt   string `json:"createdAt"`
	Released    bool   `json:"released"`
	Questions   any    `json:"questions"`
	Answers     any    `json:"answers"`
}

// ListScores returns scores filtered by week and/or student, with details
// merged per (student, week) exactly like the client's fetchDetails did.
func (s *Service) ListScores(ctx context.Context, authUID, authRole, week, studentID string) ([]Score, error) {
	out := []Score{}
	q := `SELECT id, student_id, student_name, subject, week, score, out_of, correct, wrong,
		unanswered, total, is_retake, created_at, date FROM scores`
	conds := []string{}
	args := []any{}
	if week != "" {
		args = append(args, week)
		conds = append(conds, fmt.Sprintf("week=$%d", len(args)))
	}
	if studentID != "" {
		args = append(args, studentID)
		conds = append(conds, fmt.Sprintf("student_id=$%d", len(args)))
	}
	if len(conds) > 0 {
		q += " WHERE " + strings.Join(conds, " AND ")
	}
	// Backfilled rows all carry the import time in created_at; `date` holds the
	// real submission time, so order by whichever is actually meaningful.
	q += ` ORDER BY COALESCE(date, created_at) DESC LIMIT 1000`
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return out, err
	}
	all := []Score{}
	for rows.Next() {
		var sc Score
		var created time.Time
		var subDate *time.Time
		if err := rows.Scan(&sc.ID, &sc.StudentID, &sc.StudentName, &sc.Subject, &sc.Week, &sc.Score,
			&sc.OutOf, &sc.Correct, &sc.Wrong, &sc.Unanswered, &sc.Total, &sc.IsRetake, &created, &subDate); err != nil {
			log.Printf("[quiz] ListScores scan skip: %v", err)
			continue
		}
		shown := created
		if subDate != nil {
			shown = *subDate
		}
		sc.CreatedAt = shown.UTC().Format(time.RFC3339)
		all = append(all, sc)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}
	// Ownership: non-admins may only see their own scores.
	if authRole != "admin" {
		filtered := []Score{}
		for _, r := range all {
			if r.StudentID == authUID {
				filtered = append(filtered, r)
			}
		}
		all = filtered
	}
	// Group detail keys to merge.
	type key struct{ student, week string }
	byKey := map[key][]int{}
	for i, r := range all {
		k := key{r.StudentID, r.Week}
		byKey[k] = append(byKey[k], i)
	}
	for k, idxs := range byKey {
		det, err := s.Details(ctx, authUID, authRole, k.student, k.week)
		if err != nil || !det.Released {
			continue
		}
		bySubject := map[string][]any{}
		for _, sub := range det.Subjects {
			if name, ok := sub["subject"].(string); ok {
				if qs, ok := sub["questions"].([]any); ok {
					bySubject[name] = qs
				}
			}
		}
		byAns := map[string][]any{}
		for _, an := range det.Answers {
			if name, ok := an["subject"].(string); ok {
				if as, ok := an["answers"].([]any); ok {
					byAns[name] = as
				}
			}
		}
		for _, i := range idxs {
			all[i].Released = true
			all[i].Questions = bySubject[all[i].Subject]
			all[i].Answers = byAns[all[i].Subject]
		}
	}
	for _, sc := range all {
		out = append(out, sc)
	}
	return out, nil
}
