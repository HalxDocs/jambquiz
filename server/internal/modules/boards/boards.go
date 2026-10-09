package boards

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

var subjects = []string{
	"Mathematics", "Physics", "Chemistry", "Biology",
	"English Language", "Government", "Literature in English",
	"Christian Religious Studies", "Islamic Religious Studies",
	"Commerce", "Economics",
}

// ComputeLeaderboard rebuilds the cached boards from incremental rank rows.
func (s *Service) ComputeLeaderboard(ctx context.Context) error {
	rows, err := s.pool.Query(ctx, `SELECT student_id, name, nickname, year, subjects,
		best_by_subject, total, session_count, gold_medals FROM leaderboard_student_ranks
		WHERE qualified ORDER BY total DESC LIMIT 1000`)
	if err != nil {
		return err
	}
	type rank struct {
		id       string
		name     string
		nickname string
		year     string
		subjects []string
		best     map[string]struct{ Score, OutOf int }
		total    int
		sessions int
		medals   int
	}
	ranked := []rank{}
	for rows.Next() {
		var r rank
		var bestJSON []byte
		if err := rows.Scan(&r.id, &r.name, &r.nickname, &r.year, &r.subjects, &bestJSON,
			&r.total, &r.sessions, &r.medals); err == nil {
			r.best = map[string]struct{ Score, OutOf int }{}
			_ = json.Unmarshal(bestJSON, &r.best)
			ranked = append(ranked, r)
		}
	}
	rows.Close()

	overall := []map[string]any{}
	for i, r := range ranked {
		if i >= 100 {
			break
		}
		overall = append(overall, map[string]any{"id": r.id, "name": r.name, "nickname": r.nickname,
			"year": r.year, "subjects": r.subjects, "total": r.total,
			"sessionCount": r.sessions, "goldMedals": r.medals})
	}
	if err := s.setBoard(ctx, "overall", overall); err != nil {
		return err
	}

	for _, subject := range subjects {
		top := []map[string]any{}
		type entry struct {
			id, name, nickname string
			score, outOf       int
		}
		list := []entry{}
		for _, r := range ranked {
			if b, ok := r.best[subject]; ok {
				list = append(list, entry{r.id, r.name, r.nickname, b.Score, b.OutOf})
			}
		}
		sort.Slice(list, func(i, j int) bool { return list[i].score > list[j].score })
		for i, e := range list {
			if i >= 10 {
				break
			}
			outOf := e.outOf
			if outOf == 0 {
				outOf = 100
			}
			top = append(top, map[string]any{"id": e.id, "name": e.name, "nickname": e.nickname,
				"score": e.score, "outOf": outOf})
		}
		key := "subject_" + strings.ReplaceAll(subject, " ", "_")
		if err := s.setBoard(ctx, key, top); err != nil {
			return err
		}
	}

	weeks := []string{}
	wrows, err := s.pool.Query(ctx, `SELECT DISTINCT week FROM leaderboard_week_ranks`)
	if err == nil {
		for wrows.Next() {
			var w string
			if err := wrows.Scan(&w); err == nil {
				weeks = append(weeks, w)
			}
		}
		wrows.Close()
	}
	for _, week := range weeks {
		wr, err := s.pool.Query(ctx, `SELECT student_id, name, nickname, total, session_count
			FROM leaderboard_week_ranks WHERE week=$1 ORDER BY total DESC LIMIT 100`, week)
		if err != nil {
			continue
		}
		top := []map[string]any{}
		for wr.Next() {
			var id, name, nick string
			var total, sess int
			if err := wr.Scan(&id, &name, &nick, &total, &sess); err == nil {
				top = append(top, map[string]any{"id": id, "name": name, "nickname": nick,
					"total": total, "sessionCount": sess, "goldMedals": 0})
			}
		}
		wr.Close()
		if err := s.setBoard(ctx, "week_"+strings.ReplaceAll(week, " ", "_"), top); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) setBoard(ctx context.Context, id string, top []map[string]any) error {
	if top == nil {
		top = []map[string]any{}
	}
	raw, _ := json.Marshal(top)
	_, err := s.pool.Exec(ctx, `INSERT INTO leaderboard_cache (id, top, updated_at)
		VALUES ($1,$2,now()) ON CONFLICT (id) DO UPDATE SET top=$2, updated_at=now()`, id, raw)
	return err
}

func (s *Service) board(ctx context.Context, id string) []map[string]any {
	var raw []byte
	if err := s.pool.QueryRow(ctx, `SELECT top FROM leaderboard_cache WHERE id=$1`, id).Scan(&raw); err != nil {
		return []map[string]any{}
	}
	var top []map[string]any
	_ = json.Unmarshal(raw, &top)
	if top == nil {
		return []map[string]any{}
	}
	return top
}

// Board serves a cached board (overall / subject_X / week_X).
func (s *Service) Board(ctx context.Context, id string) []map[string]any {
	return s.board(ctx, id)
}

// RefreshPublicStats recomputes the marketing counters.
func (s *Service) RefreshPublicStats(ctx context.Context) error {
	var students, quizzes, weekCount int
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM students`).Scan(&students)
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM scores`).Scan(&quizzes)
	week := s.activeWeek(ctx)
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM scores WHERE week=$1`, week).Scan(&weekCount)

	var avgPct float64
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE((data->>'averageScorePct')::float,0) FROM admin_settings WHERE id='stats_counters'`).Scan(&avgPct)
	var activeSubs int
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE((data->>'activeSubscriptions')::int,0) FROM admin_settings WHERE id='stats_counters'`).Scan(&activeSubs)

	var topScore int
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(max(total),0) FROM leaderboard_student_ranks`).Scan(&topScore)
	var topPct, topLastWeek int
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(max(score),0) FROM scores`).Scan(&topPct)
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(max(score),0) FROM scores WHERE week=$1`, week).Scan(&topLastWeek)
	if topLastWeek == 0 {
		_ = s.pool.QueryRow(ctx, `SELECT COALESCE(max(total),0) FROM leaderboard_week_ranks WHERE week=$1`, week).Scan(&topLastWeek)
	}
	var topWeekly int
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(max(total),0) FROM leaderboard_week_ranks`).Scan(&topWeekly)

	data, _ := json.Marshal(map[string]any{
		"totalStudents": students, "activeSubscriptions": activeSubs,
		"totalQuizzesTaken": quizzes, "studentsActiveThisWeek": weekCount,
		"averageScorePct": avgPct, "topScore": topScore, "topScorePct": topPct,
		"topScoreLastWeek": topLastWeek, "topWeeklyScore": topWeekly, "activeWeek": week,
	})
	_, err := s.pool.Exec(ctx, `INSERT INTO public_stats (key, data, updated_at)
		VALUES ('overview',$1,now()) ON CONFLICT (key) DO UPDATE SET data=$1, updated_at=now()`, data)
	return err
}

func (s *Service) activeWeek(ctx context.Context) string {
	var data []byte
	if err := s.pool.QueryRow(ctx, `SELECT data FROM settings WHERE key='activeWeek'`).Scan(&data); err != nil {
		return "Week 1"
	}
	var d struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.Value == "" {
		return "Week 1"
	}
	return d.Value
}

// PortalStats serves the cached public overview.
func (s *Service) PortalStats(ctx context.Context) map[string]any {
	var raw []byte
	if err := s.pool.QueryRow(ctx, `SELECT data FROM public_stats WHERE key='overview'`).Scan(&raw); err != nil {
		return nil
	}
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	return out
}

// RecomputeRanks rebuilds all rank rows from scores (post-backfill repair).
// Same math as the submit-time incremental update, applied to every student.
func (s *Service) RecomputeRanks(ctx context.Context) (students, weeks int, err error) {
	type sc struct {
		student, subject, week string
		score                  int
	}
	rows, err := s.pool.Query(ctx, `SELECT student_id, subject, week, score FROM scores`)
	if err != nil {
		return 0, 0, err
	}
	byStudent := map[string][]sc{}
	weeksSeen := map[string]bool{}
	for rows.Next() {
		var r sc
		if err := rows.Scan(&r.student, &r.subject, &r.week, &r.score); err == nil {
			byStudent[r.student] = append(byStudent[r.student], r)
			weeksSeen[r.week] = true
		}
	}
	rows.Close()
	names := map[string]struct {
		name, nickname, year string
		subjects             []string
	}{}
	nrows, err := s.pool.Query(ctx, `SELECT id, name, nickname, year, subjects FROM students`)
	if err != nil {
		return 0, 0, err
	}
	for nrows.Next() {
		var id, name, nick, year string
		var subjects []string
		if err := nrows.Scan(&id, &name, &nick, &year, &subjects); err == nil {
			names[id] = struct {
				name, nickname, year string
				subjects             []string
			}{name, nick, year, subjects}
		}
	}
	nrows.Close()

	for sid, list := range byStudent {
		best := map[string]map[string]int{}
		sess := map[string]bool{}
		wks := map[string]bool{}
		for _, r := range list {
			if cur, ok := best[r.subject]; !ok || r.score > cur["score"] {
				best[r.subject] = map[string]int{"score": r.score, "outOf": 100}
			}
			sess[r.week+"::"+r.subject] = true
			wks[r.week] = true
		}
		top := []int{}
		for _, v := range best {
			top = append(top, v["score"])
		}
		sort.Slice(top, func(i, j int) bool { return top[i] > top[j] })
		total := 0
		if len(best) >= 4 {
			for i := 0; i < 4 && i < len(top); i++ {
				total += top[i]
			}
		}
		meta := names[sid]
		bestOut, _ := json.Marshal(best)
		sessOut, _ := json.Marshal(sess)
		weeksOut, _ := json.Marshal(wks)
		if _, err := s.pool.Exec(ctx, `INSERT INTO leaderboard_student_ranks
			(student_id, name, nickname, year, subjects, best_by_subject, sessions, weeks,
			 total, session_count, gold_medals, qualified, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
			ON CONFLICT (student_id) DO UPDATE SET name=$2, nickname=$3, year=$4, subjects=$5,
			best_by_subject=$6, sessions=$7, weeks=$8, total=$9, session_count=$10,
			gold_medals=$11, qualified=$12, updated_at=now()`,
			sid, meta.name, meta.nickname, meta.year, meta.subjects, bestOut, sessOut, weeksOut,
			total, len(sess), len(wks), len(best) >= 4); err != nil {
			return students, weeks, err
		}
		students++

		byWeek := map[string][]sc{}
		for _, r := range list {
			byWeek[r.week] = append(byWeek[r.week], r)
		}
		for week, wl := range byWeek {
			wt := 0
			for _, r := range wl {
				wt += r.score
			}
			weekID := sid + "_" + strings.ReplaceAll(week, " ", "_")
			if _, err := s.pool.Exec(ctx, `INSERT INTO leaderboard_week_ranks
				(id, student_id, week, name, nickname, total, session_count, updated_at)
				VALUES ($1,$2,$3,$4,$5,$6,$7,now())
				ON CONFLICT (id) DO UPDATE SET total=$6, session_count=$7, name=$4, nickname=$5, updated_at=now()`,
				weekID, sid, week, meta.name, meta.nickname, wt, len(wl)); err != nil {
				return students, weeks, err
			}
		}
	}
	return students, len(weeksSeen), nil
}
