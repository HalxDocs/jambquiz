package notify

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/274lab/server/pkg/sms"
	"strings"
	"time"
)

const maxStaleMs = int64(8 * 24 * 60 * 60 * 1000)

func (s *Service) weekFireTimes(ctx context.Context, week string, afterEnd time.Duration) (fire time.Time, stale bool, ok bool) {
	qd := s.getQuizDates(ctx, week)
	times := quizTimes(qd)
	if len(times) == 0 {
		return time.Time{}, false, false
	}
	last := times[0]
	for _, t := range times[1:] {
		if t.After(last) {
			last = t
		}
	}
	fire = last.Add(2 * time.Hour).Add(afterEnd)
	return fire, time.Now().UTC().Sub(fire).Milliseconds() > maxStaleMs, true
}

func (s *Service) isManualWeek(ctx context.Context) bool {
	var data []byte
	if err := s.pool.QueryRow(ctx, `SELECT data FROM settings WHERE key='activeWeek'`).Scan(&data); err != nil {
		return false
	}
	var d struct {
		Source string `json:"source"`
	}
	_ = json.Unmarshal(data, &d)
	return d.Source == "manual"
}

type studentContact struct {
	id           string
	name         string
	subjects     []string
	suspended    bool
	missedStreak int
	parent       string
	teacher      string
	phone        string
}

func (s *Service) allStudents(ctx context.Context) []studentContact {
	rows, err := s.pool.Query(ctx, `SELECT id, name, subjects, suspended, missed_streak,
		parent_phone, teacher_phone, phone FROM students`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []studentContact{}
	for rows.Next() {
		var st studentContact
		if err := rows.Scan(&st.id, &st.name, &st.subjects, &st.suspended, &st.missedStreak,
			&st.parent, &st.teacher, &st.phone); err == nil {
			out = append(out, st)
		}
	}
	return out
}

func (s *Service) scoresByStudent(ctx context.Context, week string) map[string][]map[string]any {
	out := map[string][]map[string]any{}
	rows, err := s.pool.Query(ctx, `SELECT student_id, subject, score FROM scores WHERE week=$1`, week)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var sid, subj string
		var score int
		if err := rows.Scan(&sid, &subj, &score); err == nil {
			out[sid] = append(out[sid], map[string]any{"subject": subj, "score": score})
		}
	}
	return out
}

// claimGuard atomically claims a per-student guard. Returns claimed=true when
// this pass owns it, sent=true when a previous pass already delivered.
func (s *Service) claimGuard(ctx context.Context, guardID, studentID, week, reason string) (claimed, sent bool) {
	var existing int
	err := s.pool.QueryRow(ctx, `SELECT sent FROM reminder_sent WHERE key=$1`, guardID).Scan(&existing)
	if err == nil {
		if existing > 0 {
			return false, true
		}
		s.pool.Exec(ctx, `DELETE FROM reminder_sent WHERE key=$1`, guardID)
	}
	res, err := s.pool.Exec(ctx, `INSERT INTO reminder_sent (key, sent) VALUES ($1,0) ON CONFLICT (key) DO NOTHING`)
	if err != nil || res.RowsAffected() == 0 {
		return false, false
	}
	return true, false
}

func (s *Service) completeGuard(ctx context.Context, guardID string, sent int) {
	if sent > 0 {
		s.pool.Exec(ctx, `UPDATE reminder_sent SET sent=$1, sent_at=now() WHERE key=$2`, sent, guardID)
	} else {
		s.pool.Exec(ctx, `DELETE FROM reminder_sent WHERE key=$1`, guardID)
	}
}

// RunAbsentSMS alerts accountability partners of students with no score.
func (s *Service) RunAbsentSMS(ctx context.Context, now time.Time) (int, error) {
	if s.cfg.TermiiKey == "" {
		return 0, nil
	}
	week := s.activeWeek(ctx)
	fire, stale, ok := s.weekFireTimes(ctx, week, 5*time.Minute)
	if !ok || now.Before(fire) {
		return 0, nil
	}
	if stale && s.isManualWeek(ctx) {
		return 0, nil
	}
	guardID := "absent_sms_" + strings.ReplaceAll(week, " ", "_")
	var sentGuard int
	_ = s.pool.QueryRow(ctx, `SELECT (data->>'sent')::int FROM admin_settings WHERE id=$1`, guardID).Scan(&sentGuard)
	if sentGuard > 0 {
		return 0, nil
	}
	if sentGuard == 0 {
		var has bool
		_ = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM admin_settings WHERE id=$1)`, guardID).Scan(&has)
		if has {
			s.pool.Exec(ctx, `DELETE FROM admin_settings WHERE id=$1`, guardID)
		}
	}

	withScores := map[string]bool{}
	for sid := range s.scoresByStudent(ctx, week) {
		withScores[sid] = true
	}
	names := s.getTopicNames(ctx, week)
	sent, skipped := 0, 0
	for _, st := range s.allStudents(ctx) {
		if withScores[st.id] || st.suspended || st.missedStreak >= 6 {
			skipped++
			continue
		}
		phones := labeledPhones(st)
		if len(phones) == 0 {
			skipped++
			continue
		}
		guard := fmt.Sprintf("absent_%s_%s", st.id, sanitizeWeek(week))
		claimed, already := s.claimGuard(ctx, guard, st.id, week, "absent")
		if !claimed {
			skipped++
			_ = already
			continue
		}
		subs := []struct {
			Subject string
			Score   *int
		}{}
		for _, sub := range st.subjects {
			subs = append(subs, struct {
				Subject string
				Score   *int
			}{sub, nil})
		}
		text := buildSmsBody(orName(st.name), week, subs, names)
		n := 0
		for _, p := range phones {
			r := s.sms.Send(ctx, p.phone, text)
			if r.OK {
				n++
			} else {
				s.recordSmsFailure(ctx, p.phone, text, r.Error, st.id, week, p.label, "absent")
			}
		}
		s.completeGuard(ctx, guard, n)
		if n > 0 {
			sent++
		} else {
			skipped++
		}
	}
	if sent > 0 {
		s.pool.Exec(ctx, `INSERT INTO admin_settings (id, data) VALUES ($1,$2)
			ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=now()`,
			guardID, fmt.Sprintf(`{"sent":%d,"week":%q}`, sent, week))
	}
	return sent, nil
}

type labeledPhone struct {
	label string
	phone string
}

func labeledPhones(st studentContact) []labeledPhone {
	out := []labeledPhone{}
	for _, p := range []labeledPhone{
		{"parent", smsNormalize(st.parent)},
		{"teacher", smsNormalize(st.teacher)},
		{"student", smsNormalize(st.phone)},
	} {
		if p.phone != "" {
			out = append(out, p)
		}
	}
	return out
}

func smsNormalize(p string) string {
	return sms.Normalize(p)
}

func orName(n string) string {
	if n == "" {
		return "Student"
	}
	return n
}

// RunQuizSMSReport sends score reports for students with scores.
func (s *Service) RunQuizSMSReport(ctx context.Context, now time.Time) (int, error) {
	if s.cfg.TermiiKey == "" {
		return 0, nil
	}
	week := s.activeWeek(ctx)
	fire, stale, ok := s.weekFireTimes(ctx, week, 5*time.Minute)
	if !ok || now.Before(fire) {
		return 0, nil
	}
	if stale && s.isManualWeek(ctx) {
		return 0, nil
	}
	guardID := "quiz_sms_" + strings.ReplaceAll(week, " ", "_")
	var sentGuard int
	_ = s.pool.QueryRow(ctx, `SELECT (data->>'sent')::int FROM admin_settings WHERE id=$1`, guardID).Scan(&sentGuard)
	if sentGuard > 0 {
		return 0, nil
	}
	if sentGuard == 0 {
		var has bool
		_ = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM admin_settings WHERE id=$1)`, guardID).Scan(&has)
		if has {
			s.pool.Exec(ctx, `DELETE FROM admin_settings WHERE id=$1`, guardID)
		}
	}

	byStudent := s.scoresByStudent(ctx, week)
	byID := map[string]studentContact{}
	for _, st := range s.allStudents(ctx) {
		byID[st.id] = st
	}
	names := s.getTopicNames(ctx, week)
	sent, skipped := 0, 0
	for sid, scores := range byStudent {
		st, ok := byID[sid]
		if !ok || st.suspended || st.missedStreak >= 6 {
			skipped++
			continue
		}
		submitted := map[string]bool{}
		for _, sc := range scores {
			if sub, ok := sc["subject"].(string); ok {
				submitted[sub] = true
			}
		}
		if len(submitted) == 0 {
			skipped++
			continue
		}
		phones := labeledPhones(st)
		if len(phones) == 0 {
			skipped++
			continue
		}
		guard := fmt.Sprintf("sms_%s_%s", sid, sanitizeWeek(week))
		claimed, _ := s.claimGuard(ctx, guard, sid, week, "result")
		if !claimed {
			skipped++
			continue
		}
		bySub := map[string]int{}
		for _, sc := range scores {
			if sub, ok := sc["subject"].(string); ok {
				if sc2, ok := sc["score"].(int); ok {
					bySub[sub] = sc2
				}
			}
		}
		subs := []struct {
			Subject string
			Score   *int
		}{}
		for _, sub := range st.subjects {
			if v, ok := bySub[sub]; ok {
				vv := v
				subs = append(subs, struct {
					Subject string
					Score   *int
				}{sub, &vv})
			} else {
				subs = append(subs, struct {
					Subject string
					Score   *int
				}{sub, nil})
			}
		}
		text := buildSmsBody(orName(st.name), week, subs, names)
		n := 0
		for _, p := range phones {
			r := s.sms.Send(ctx, p.phone, text)
			if r.OK {
				n++
			} else {
				s.recordSmsFailure(ctx, p.phone, text, r.Error, sid, week, p.label, "quiz-report")
			}
		}
		s.completeGuard(ctx, guard, n)
		if n > 0 {
			sent++
		} else {
			skipped++
		}
	}
	if sent > 0 {
		s.pool.Exec(ctx, `INSERT INTO admin_settings (id, data) VALUES ($1,$2)
			ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=now()`,
			guardID, fmt.Sprintf(`{"sent":%d,"week":%q}`, sent, week))
	}
	return sent, nil
}

// SendRealtimeResultSMS fires on quiz submission (wired via quiz hook).
func (s *Service) SendRealtimeResultSMS(ctx context.Context, studentID, week string, results []map[string]any) {
	if s.cfg.TermiiKey == "" {
		return
	}
	var name string
	var subjects []string
	var parent, teacher, phone string
	if err := s.pool.QueryRow(ctx, `SELECT name, subjects, parent_phone, teacher_phone, phone
		FROM students WHERE id=$1`, studentID).Scan(&name, &subjects, &parent, &teacher, &phone); err != nil {
		return
	}
	if len(subjects) == 0 {
		return
	}
	bySub := map[string]int{}
	for _, r := range results {
		if sub, ok := r["subject"].(string); ok {
			switch v := r["score"].(type) {
			case int:
				bySub[sub] = v
			case float64:
				bySub[sub] = int(v)
			}
		}
	}
	subs := []struct {
		Subject string
		Score   *int
	}{}
	for _, sub := range subjects {
		if v, ok := bySub[sub]; ok {
			vv := v
			subs = append(subs, struct {
				Subject string
				Score   *int
			}{sub, &vv})
		} else {
			subs = append(subs, struct {
				Subject string
				Score   *int
			}{sub, nil})
		}
	}
	names := s.getTopicNames(ctx, week)
	text := buildSmsBody(orName(name), week, subs, names)
	guard := fmt.Sprintf("sms_%s_%s", studentID, sanitizeWeek(week))
	claimed, _ := s.claimGuard(ctx, guard, studentID, week, "result")
	if !claimed {
		return
	}
	st := studentContact{id: studentID, parent: parent, teacher: teacher, phone: phone}
	n := 0
	for _, p := range labeledPhones(st) {
		r := s.sms.Send(ctx, p.phone, text)
		if r.OK {
			n++
		} else {
			s.recordSmsFailure(ctx, p.phone, text, r.Error, studentID, week, p.label, "realtime-result")
		}
	}
	s.completeGuard(ctx, guard, n)
}
