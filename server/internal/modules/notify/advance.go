package notify

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/274lab/server/pkg/sms"
	"strings"
	"time"
)

// RunAdvanceWeek rolls the active week forward once its quizzes ended,
// auto-schedules the next week, and tracks missed streaks/suspensions.
func (s *Service) RunAdvanceWeek(ctx context.Context, now time.Time) (string, error) {
	week := s.activeWeek(ctx)
	var source string
	var data []byte
	_ = s.pool.QueryRow(ctx, `SELECT data FROM settings WHERE key='activeWeek'`).Scan(&data)
	var ad struct {
		Source string `json:"source"`
	}
	_ = json.Unmarshal(data, &ad)
	source = ad.Source
	manualWeek := source == "manual"

	qd := s.getQuizDates(ctx, week)
	times := quizTimes(qd)
	if len(times) == 0 {
		return "", nil
	}
	lastQuizEnd := times[0]
	for _, t := range times[1:] {
		if t.After(lastQuizEnd) {
			lastQuizEnd = t
		}
	}
	fireTime := lastQuizEnd.Add(3 * time.Hour)
	if now.Before(fireTime) {
		return "", nil
	}

	// Stale fast-forward (no penalties for weeks that never ran).
	if now.Sub(fireTime).Milliseconds() > maxStaleMs {
		if manualWeek {
			return "", nil
		}
		var num int
		if _, err := fmt.Sscanf(week, "Week %d", &num); err != nil || num < 1 {
			return "", nil
		}
		const day = 24 * time.Hour
		elapsed := int(now.Sub(fireTime).Round(7*day) / (7 * day))
		if elapsed < 1 {
			elapsed = 1
		}
		if elapsed > 25 {
			elapsed = 25
		}
		target := num + elapsed
		if target > 26 {
			target = 26
		}
		if target == num {
			return "", nil
		}
		targetWeek := fmt.Sprintf("Week %d", target)
		realign := time.Duration(elapsed+1) * 7 * day
		d1 := times[0].Add(realign).UTC().Format(time.RFC3339)
		d2 := ""
		if len(times) > 1 {
			d2 = times[1].Add(realign).UTC().Format(time.RFC3339)
		}
		targetID := "quizDates_" + sanitizeWeek(targetWeek)
		s.pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ($1,$2)
			ON CONFLICT (key) DO UPDATE SET data=$2, updated_at=now()`,
			targetID, fmt.Sprintf(`{"key":"quizDates_%s","date1":%q,"date2":%q,"autoScheduled":true}`, targetWeek, d1, d2))
		s.pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ('activeWeek',$1)
			ON CONFLICT (key) DO UPDATE SET data=$1, updated_at=now()`,
			fmt.Sprintf(`{"value":%q,"source":"auto"}`, targetWeek))
		s.pool.Exec(ctx, `INSERT INTO admin_settings (id, data) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`,
			"advance_week_"+strings.ReplaceAll(week, " ", "_"),
			fmt.Sprintf(`{"week":%q,"advancedTo":%q,"fastForward":true}`, week, targetWeek))
		return targetWeek, nil
	}

	// Once-per-week guard (self-healing when the advance never stuck).
	guardID := "advance_week_" + strings.ReplaceAll(week, " ", "_")
	var guardData []byte
	_ = s.pool.QueryRow(ctx, `SELECT data FROM admin_settings WHERE id=$1`, guardID).Scan(&guardData)
	if guardData != nil {
		var g struct {
			AdvancedTo string `json:"advancedTo"`
		}
		_ = json.Unmarshal(guardData, &g)
		if g.AdvancedTo != "" && g.AdvancedTo != week {
			s.pool.Exec(ctx, `DELETE FROM admin_settings WHERE id=$1`, guardID)
		} else {
			return "", nil
		}
	}

	var num int
	if _, err := fmt.Sscanf(week, "Week %d", &num); err != nil || num < 1 || num >= 26 {
		return "", nil
	}
	next := fmt.Sprintf("Week %d", num+1)
	s.pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ('activeWeek',$1)
		ON CONFLICT (key) DO UPDATE SET data=$1, updated_at=now()`,
		fmt.Sprintf(`{"value":%q,"source":"auto"}`, next))

	// Auto-schedule next week's dates (+7d) when missing.
	nextID := "quizDates_" + sanitizeWeek(next)
	var hasNext bool
	_ = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM settings WHERE key=$1)`, nextID).Scan(&hasNext)
	if !hasNext && len(times) > 0 {
		const weekDur = 7 * 24 * time.Hour
		nd1 := times[0].Add(weekDur).UTC().Format(time.RFC3339)
		nd2 := ""
		if len(times) > 1 {
			nd2 = times[1].Add(weekDur).UTC().Format(time.RFC3339)
		}
		s.pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`,
			nextID, fmt.Sprintf(`{"key":"quizDates_%s","date1":%q,"date2":%q,"autoScheduled":true}`, next, nd1, nd2))
	}

	// Missed streaks: new joiners (after window opened) and the un-onboarded
	// are never penalized.
	withScores := map[string]bool{}
	rows, err := s.pool.Query(ctx, `SELECT DISTINCT student_id FROM scores WHERE week=$1`, week)
	if err == nil {
		for rows.Next() {
			var sid string
			if err := rows.Scan(&sid); err == nil {
				withScores[sid] = true
			}
		}
		rows.Close()
	}
	weekStart := times[0]
	for _, st := range s.allStudents(ctx) {
		var joined *time.Time
		var trial *time.Time
		var subjects []string
		var streak int
		var suspended bool
		_ = s.pool.QueryRow(ctx, `SELECT joined_at, trial_started_at, subjects, missed_streak, suspended
			FROM students WHERE id=$1`, st.id).Scan(&joined, &trial, &subjects, &streak, &suspended)
		joinTs := joined
		if joinTs == nil {
			joinTs = trial
		}
		enrolled := (joinTs == nil || !joinTs.After(weekStart)) && len(subjects) > 0
		switch {
		case withScores[st.id]:
			if streak > 0 {
				s.pool.Exec(ctx, `UPDATE students SET missed_streak=0, updated_at=now() WHERE id=$1`, st.id)
			}
		case enrolled:
			streak++
			if streak >= 6 && !suspended {
				s.pool.Exec(ctx, `UPDATE students SET missed_streak=$1, suspended=true, updated_at=now() WHERE id=$2`, streak, st.id)
				s.sendSuspensionSMS(ctx, st.id, st.name, streak)
			} else {
				s.pool.Exec(ctx, `UPDATE students SET missed_streak=$1, updated_at=now() WHERE id=$2`, streak, st.id)
			}
		default:
			if streak > 0 {
				s.pool.Exec(ctx, `UPDATE students SET missed_streak=0, updated_at=now() WHERE id=$1`, st.id)
			}
		}
	}

	s.pool.Exec(ctx, `INSERT INTO admin_settings (id, data) VALUES ($1,$2)
		ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=now()`,
		guardID, fmt.Sprintf(`{"week":%q,"advancedTo":%q}`, week, next))
	return next, nil
}

func (s *Service) sendSuspensionSMS(ctx context.Context, studentID, name string, streak int) {
	if s.cfg.TermiiKey == "" {
		return
	}
	var parent, teacher, recovery string
	_ = s.pool.QueryRow(ctx, `SELECT parent_phone, teacher_phone, COALESCE(recovery_code,'') FROM students WHERE id=$1`,
		studentID).Scan(&parent, &teacher, &recovery)
	phones := []string{sms.Normalize(parent), sms.Normalize(teacher)}
	phones = filterNonEmpty(phones)
	if len(phones) == 0 || recovery == "" {
		return
	}
	text := "Hi,\n\n" + orName(name) + " account was suspended for missing " + itoa(streak) +
		" weekly tests.\n\nTo recover account, let him enter the code: " + recovery +
		". But don't give them until they show readiness to study.\n\nPowered by 274Lab"
	for _, p := range phones {
		r := s.sms.Send(ctx, p, text)
		if !r.OK {
			s.recordSmsFailure(ctx, p, text, r.Error, studentID, "", "partner", "suspension")
		}
	}
}

func filterNonEmpty(in []string) []string {
	out := []string{}
	for _, v := range in {
		if v != "" {
			out = append(out, v)
		}
	}
	return out
}
