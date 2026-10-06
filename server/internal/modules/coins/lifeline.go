package coins

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	"github.com/274lab/server/internal/ratelimit"
	"github.com/274lab/server/pkg/ids"
	"github.com/jackc/pgx/v5"
)

const (
	lifelineUsesPerTest = 5
	costAsk3            = 10
	costAsk2            = 6
	costAsk1            = 2
	costPeek            = 2
	costFifty           = 2
)

type LifelineResult struct {
	Cached           bool   `json:"cached,omitempty"`
	Coins            int    `json:"coins"`
	Cost             int    `json:"cost,omitempty"`
	Eliminate        []int  `json:"eliminate,omitempty"`
	Shown            []int  `json:"shown,omitempty"`
	GoatID           string `json:"goatId,omitempty"`
	GoatName         string `json:"goatName,omitempty"`
	Stars            int    `json:"stars,omitempty"`
	Explanation      string `json:"explanation,omitempty"`
	ExplanationImage string `json:"explanationImage,omitempty"`
	FriendID         string `json:"friendId,omitempty"`
	FriendName       string `json:"friendName,omitempty"`
	OptionText       string `json:"optionText,omitempty"`
}

// rotHash is the deterministic rotation hash from the Node engine.
func rotHash(s string) uint32 {
	var h uint32
	for i := 0; i < len(s); i++ {
		h = (h*31 + uint32(s[i]))
	}
	return h
}

func (s *Service) UseLifeline(ctx context.Context, authUID, studentID, sessionID, subject string, qIndex int, kind, goatID, friendID string) (LifelineResult, error) {
	var out LifelineResult
	if studentID == "" || sessionID == "" || subject == "" || qIndex < 0 {
		return out, ErrBadInput
	}
	if kind != "ask" && kind != "peek" && kind != "fifty" {
		return out, ErrBadInput
	}
	if !ratelimit.Allow(ctx, s.pool, "lifeline:"+authUID, 30, 60*60*1000) {
		return out, ErrRateLimited
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return out, err
	}
	defer tx.Rollback(ctx)

	var sessUID, week, status string
	var assignJSON, usageJSON, narrowedJSON []byte
	if err := tx.QueryRow(ctx, `SELECT uid, week, status, assignments, lifeline_usage, narrowed
		FROM quiz_sessions WHERE id=$1 FOR UPDATE`, sessionID,
	).Scan(&sessUID, &week, &status, &assignJSON, &usageJSON, &narrowedJSON); err != nil {
		return out, ErrNotFound
	}
	if sessUID != authUID {
		return out, ErrForbidden
	}
	if status == "submitted" {
		return out, ErrBadInput
	}
	var assignments map[string][]string
	_ = json.Unmarshal(nullArrJSON(assignJSON, "{}"), &assignments)
	qids, ok := assignments[subject]
	if !ok || qIndex >= len(qids) {
		return out, ErrBadInput
	}
	questionID := qids[qIndex]
	qKey := subject + "::" + itoa(qIndex)

	var stUID string
	var stCoins int
	var squad []string
	if err := tx.QueryRow(ctx, `SELECT COALESCE(uid,''), coins, squad FROM students WHERE id=$1 FOR UPDATE`,
		studentID).Scan(&stUID, &stCoins, &squad); err != nil {
		return out, ErrNotFound
	}
	if stUID != "" && stUID != authUID {
		return out, ErrForbidden
	}

	usage := map[string]int{}
	_ = json.Unmarshal(nullArrJSON(usageJSON, "{}"), &usage)
	if usage[kind] >= lifelineUsesPerTest {
		return out, ErrBadInput
	}
	narrowed := map[string]map[string]any{}
	_ = json.Unmarshal(nullArrJSON(narrowedJSON, "{}"), &narrowed)
	if (kind == "fifty" || kind == "ask") && narrowed[qKey] != nil {
		cached := narrowed[qKey]
		out.Cached = true
		out.Coins = stCoins
		out.GoatID, _ = cached["goatId"].(string)
		out.GoatName, _ = cached["goatName"].(string)
		if st, ok := cached["stars"].(float64); ok {
			out.Stars = int(st)
		}
		if elim, ok := cached["eliminate"].([]any); ok {
			for _, e := range elim {
				if f, ok := e.(float64); ok {
					out.Eliminate = append(out.Eliminate, int(f))
				}
			}
		}
		if shown, ok := cached["shown"].([]any); ok {
			for _, e := range shown {
				if f, ok := e.(float64); ok {
					out.Shown = append(out.Shown, int(f))
				}
			}
		}
		return out, nil
	}

	answerOf := func(qid string) int {
		var ans int
		if err := tx.QueryRow(ctx, `SELECT answer FROM question_answers WHERE question_id=$1`, qid).Scan(&ans); err != nil {
			return -1
		}
		return ans
	}

	cost := 0
	payload := map[string]any{}
	switch kind {
	case "fifty":
		cost = costFifty
		correct := answerOf(questionID)
		if correct < 0 {
			return out, ErrBadInput
		}
		wrong := []int{}
		for i := 0; i < 4; i++ {
			if i != correct {
				wrong = append(wrong, i)
			}
		}
		h := rotHash(questionID)
		elim := []int{wrong[h%uint32(len(wrong))], wrong[(h+1)%uint32(len(wrong))]}
		sort.Ints(elim)
		payload = map[string]any{"kind": "fifty", "eliminate": elim}
		narrowed[qKey] = payload
		out.Eliminate = elim
	case "ask":
		if goatID == "" {
			return out, ErrBadInput
		}
		var gName, gProfession string
		var starsJSON, explJSON []byte
		if err := tx.QueryRow(ctx, `SELECT name, profession, stars, explanations FROM goats WHERE id=$1`,
			goatID).Scan(&gName, &gProfession, &starsJSON, &explJSON); err != nil {
			return out, ErrNotFound
		}
		var weekGoats []string
		_ = tx.QueryRow(ctx, `SELECT goat_ids FROM goat_weeks WHERE week=$1`, week).Scan(&weekGoats)
		allowed := false
		for _, g := range weekGoats {
			if g == goatID {
				allowed = true
				break
			}
		}
		if !allowed {
			return out, ErrBadInput
		}
		starsBySubj := map[string]int{}
		_ = json.Unmarshal(nullArrJSON(starsJSON, "{}"), &starsBySubj)
		stars := starsBySubj[subject]
		if stars < 0 {
			stars = 0
		}
		if stars > 3 {
			stars = 3
		}
		if stars == 0 {
			return out, ErrBadInput
		}
		switch stars {
		case 3:
			cost = costAsk3
		case 2:
			cost = costAsk2
		default:
			cost = costAsk1
		}
		correct := answerOf(questionID)
		if correct < 0 {
			return out, ErrBadInput
		}
		out.GoatID = goatID
		out.GoatName = gName
		out.Stars = stars
		if stars == 3 {
			var explanation, explImg string
			_ = tx.QueryRow(ctx, `SELECT explanation, explanation_image FROM questions WHERE id=$1`,
				questionID).Scan(&explanation, &explImg)
			if strings.TrimSpace(explanation) == "" {
				explBySubj := map[string]string{}
				_ = json.Unmarshal(nullArrJSON(explJSON, "{}"), &explBySubj)
				explanation = explBySubj[subject]
			}
			out.Explanation = explanation
			out.ExplanationImage = explImg
		} else {
			wrong := []int{}
			for i := 0; i < 4; i++ {
				if i != correct {
					wrong = append(wrong, i)
				}
			}
			h := rotHash(questionID)
			keepCount := 2
			if stars == 2 {
				keepCount = 1
			}
			kept := []int{}
			for i := 0; i < keepCount; i++ {
				kept = append(kept, wrong[(h+uint32(i))%uint32(len(wrong))])
			}
			shown := append(append([]int{}, kept...), correct)
			sort.Ints(shown)
			out.Shown = shown
			payload = map[string]any{"kind": "ask", "stars": stars, "shown": shown, "goatId": goatID, "goatName": gName}
			narrowed[qKey] = payload
		}
	case "peek":
		cost = costPeek
		if friendID == "" {
			return out, ErrBadInput
		}
		inSquad := false
		for _, f := range squad {
			if f == friendID {
				inSquad = true
				break
			}
		}
		if !inSquad {
			return out, ErrForbidden
		}
		text, _, err := s.peekAnswer(ctx, tx, friendID, week, subject, questionID)
		if err != nil {
			return out, err
		}
		var fname string
		_ = tx.QueryRow(ctx, `SELECT name FROM students WHERE id=$1`, friendID).Scan(&fname)
		if fname == "" {
			fname = "Friend"
		}
		out.FriendID = friendID
		out.FriendName = fname
		out.OptionText = text
	}

	if stCoins < cost {
		return out, ErrNoCoins
	}
	stCoins -= cost
	if _, err := tx.Exec(ctx, `UPDATE students SET coins=$1, updated_at=now() WHERE id=$2`, stCoins, studentID); err != nil {
		return out, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO coin_ledger (id, student_id, uid, delta, reason, ref)
		VALUES ($1,$2,$3,$4,$5,$6)`, ids.New(), studentID, stUID, -cost, "lifeline_"+kind, sessionID); err != nil {
		return out, err
	}
	usage[kind]++
	usageJSON2, _ := json.Marshal(usage)
	narrowedJSON2, _ := json.Marshal(narrowed)
	if _, err := tx.Exec(ctx, `UPDATE quiz_sessions SET lifeline_usage=$1, narrowed=$2 WHERE id=$3`,
		usageJSON2, narrowedJSON2, sessionID); err != nil {
		return out, err
	}
	if err := tx.Commit(ctx); err != nil {
		return out, err
	}
	out.Coins = stCoins
	out.Cost = cost
	return out, nil
}

func nullArrJSON(b []byte, fallback string) []byte {
	if len(b) == 0 {
		return []byte(fallback)
	}
	return b
}

// peekAnswer resolves the friend's picked option text for the same question,
// else their latest answered question in the subject.
func (s *Service) peekAnswer(ctx context.Context, tx pgx.Tx, friendID, week, subject, questionID string) (string, string, error) {
	detailID := friendID + "_" + strings.ReplaceAll(week, " ", "_")
	var subjJSON, ansJSON []byte
	if err := tx.QueryRow(ctx, `SELECT subjects, answers FROM score_details WHERE id=$1`, detailID).Scan(&subjJSON, &ansJSON); err != nil {
		return "", "", ErrBadInput
	}
	var subjects []map[string]any
	var answers []map[string]any
	_ = json.Unmarshal(subjJSON, &subjects)
	_ = json.Unmarshal(ansJSON, &answers)
	var subQ []any
	var subA []any
	for _, sb := range subjects {
		if sb["subject"] == subject {
			subQ, _ = sb["questions"].([]any)
		}
	}
	for _, an := range answers {
		if an["subject"] == subject {
			subA, _ = an["answers"].([]any)
		}
	}
	num := func(v any) (int, bool) {
		switch n := v.(type) {
		case float64:
			return int(n), true
		case int:
			return n, true
		}
		return 0, false
	}
	textOf := func(qi int, a int) (string, bool) {
		if qi < 0 || qi >= len(subQ) {
			return "", false
		}
		qm, _ := subQ[qi].(map[string]any)
		opts, _ := qm["options"].([]any)
		if a < 0 || a >= len(opts) {
			return "", false
		}
		t, _ := opts[a].(string)
		if t == "" {
			return "", false
		}
		return t, true
	}
	j := -1
	for i, q := range subQ {
		if qm, ok := q.(map[string]any); ok && qm["id"] == questionID {
			j = i
			break
		}
	}
	if j >= 0 && j < len(subA) {
		if a, ok := num(subA[j]); ok && a >= 0 {
			if t, ok := textOf(j, a); ok {
				return t, "", nil
			}
		}
	}
	for qi := len(subA) - 1; qi >= 0; qi-- {
		if a, ok := num(subA[qi]); ok && a >= 0 {
			if t, ok := textOf(qi, a); ok {
				return t, "", nil
			}
		}
	}
	return "", "", ErrBadInput
}

type PeekStatus struct {
	FriendID   string `json:"friendId"`
	FriendName string `json:"friendName"`
	Answered   bool   `json:"answered"`
	HasTest    bool   `json:"hasTest"`
}

func (s *Service) PeekStatus(ctx context.Context, authUID, studentID, sessionID, subject string, qIndex int, friendIDs []string) ([]PeekStatus, error) {
	out := []PeekStatus{}
	if studentID == "" || sessionID == "" || subject == "" || qIndex < 0 {
		return out, ErrBadInput
	}
	if !ratelimit.Allow(ctx, s.pool, "peekStatus:"+authUID, 60, 60*60*1000) {
		return nil, ErrRateLimited
	}
	wanted := []string{}
	seen := map[string]bool{}
	for _, f := range friendIDs {
		if f == "" || seen[f] {
			continue
		}
		seen[f] = true
		wanted = append(wanted, f)
		if len(wanted) == 4 {
			break
		}
	}
	if len(wanted) == 0 {
		return out, nil
	}
	var sessUID, week string
	var assignJSON []byte
	var status string
	if err := s.pool.QueryRow(ctx, `SELECT uid, week, status, assignments FROM quiz_sessions WHERE id=$1`,
		sessionID).Scan(&sessUID, &week, &status, &assignJSON); err != nil {
		return out, ErrNotFound
	}
	if sessUID != authUID {
		return out, ErrForbidden
	}
	if status == "submitted" {
		return out, ErrBadInput
	}
	var assignments map[string][]string
	_ = json.Unmarshal(nullArrJSON(assignJSON, "{}"), &assignments)
	qids, ok := assignments[subject]
	if !ok || qIndex >= len(qids) {
		return out, ErrBadInput
	}
	questionID := qids[qIndex]
	var squad []string
	var stUID string
	if err := s.pool.QueryRow(ctx, `SELECT squad, COALESCE(uid,'') FROM students WHERE id=$1`,
		studentID).Scan(&squad, &stUID); err != nil {
		return out, ErrNotFound
	}
	if stUID != "" && stUID != authUID {
		return out, ErrForbidden
	}
	inSquad := map[string]bool{}
	for _, f := range squad {
		inSquad[f] = true
	}
	weekKey := strings.ReplaceAll(week, " ", "_")
	for _, fid := range wanted {
		if !inSquad[fid] {
			continue
		}
		ps := PeekStatus{FriendID: fid, FriendName: "Friend"}
		var fname string
		_ = s.pool.QueryRow(ctx, `SELECT name FROM students WHERE id=$1`, fid).Scan(&fname)
		if fname != "" {
			ps.FriendName = fname
		}
		var subjJSON, ansJSON []byte
		if err := s.pool.QueryRow(ctx, `SELECT subjects, answers FROM score_details WHERE id=$1`,
			fid+"_"+weekKey).Scan(&subjJSON, &ansJSON); err != nil {
			out = append(out, ps)
			continue
		}
		ps.HasTest = true
		var subjects []map[string]any
		var answers []map[string]any
		_ = json.Unmarshal(subjJSON, &subjects)
		_ = json.Unmarshal(ansJSON, &answers)
		var subQ []any
		var subA []any
		for _, sb := range subjects {
			if sb["subject"] == subject {
				subQ, _ = sb["questions"].([]any)
			}
		}
		for _, an := range answers {
			if an["subject"] == subject {
				subA, _ = an["answers"].([]any)
			}
		}
		j := -1
		for i, q := range subQ {
			if qm, ok := q.(map[string]any); ok && qm["id"] == questionID {
				j = i
				break
			}
		}
		if j >= 0 && j < len(subA) {
			if a, ok := subA[j].(float64); ok && a >= 0 {
				ps.Answered = true
			}
		}
		out = append(out, ps)
	}
	return out, nil
}
