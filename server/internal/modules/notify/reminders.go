package notify

import (
	"context"
	"time"
)

// RunQuizReminders fires 2h / 1.5h / 15m / 5m reminders with per-key guards.
func (s *Service) RunQuizReminders(ctx context.Context, now time.Time) (int, error) {
	if s.notificationsDisabled(ctx) {
		return 0, nil
	}
	if !s.sender.Configured() {
		return 0, nil
	}
	week := s.activeWeek(ctx)
	qd := s.getQuizDates(ctx, week)
	times := quizTimes(qd)
	if len(times) == 0 {
		return 0, nil
	}
	intervals := []struct {
		label string
		ms    int64
		body  string
	}{
		{"2h", 2 * 60 * 60 * 1000, "Your quiz starts in 2 hours! Time to review."},
		{"1.5h", 90 * 60 * 1000, "Quiz in 1 hour 30 minutes! Get your notes ready."},
		{"15m", 15 * 60 * 1000, "Quiz starts in 15 minutes! Log in now."},
		{"5m", 5 * 60 * 1000, "5 minutes to quiz time! Find a quiet spot."},
	}
	subs := s.allSubs(ctx)
	if len(subs) == 0 {
		return 0, nil
	}
	sent := 0
	for i, t := range times {
		for _, iv := range intervals {
			until := t.UnixMilli() - now.UnixMilli()
			if until <= 0 {
				continue
			}
			diff := until - iv.ms
			if diff < 0 {
				diff = -diff
			}
			if diff > 60*1000 {
				continue
			}
			key := week + "_date" + itoa(i+1) + "_" + iv.label
			var exists bool
			_ = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM reminder_sent WHERE key=$1)`, key).Scan(&exists)
			if exists {
				continue
			}
			for _, sub := range subs {
				if !s.eligibleSubscriber(ctx, sub.studentID, now) {
					continue
				}
				payload := map[string]any{"type": "broadcast", "title": "Quiz Reminder",
					"message": iv.body, "broadcastId": "quiz-reminder-" + key}
				ok, gone, _ := s.sender.Send(sub.endpoint, sub.p256dh, sub.auth, payload, 3600)
				if gone {
					s.pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE student_id=$1`, sub.studentID)
					continue
				}
				if ok {
					sent++
				}
			}
			s.pool.Exec(ctx, `INSERT INTO reminder_sent (key, sent, sent_at) VALUES ($1,$2,now())
				ON CONFLICT (key) DO NOTHING`, key, sent)
		}
	}
	return sent, nil
}

// RunQuizTime fires within 5 minutes after each quiz start.
func (s *Service) RunQuizTime(ctx context.Context, now time.Time) (int, error) {
	if s.notificationsDisabled(ctx) {
		return 0, nil
	}
	if !s.sender.Configured() {
		return 0, nil
	}
	week := s.activeWeek(ctx)
	qd := s.getQuizDates(ctx, week)
	times := quizTimes(qd)
	if len(times) == 0 {
		return 0, nil
	}
	subs := s.allSubs(ctx)
	if len(subs) == 0 {
		return 0, nil
	}
	sent := 0
	for i, t := range times {
		diff := now.UnixMilli() - t.UnixMilli()
		if diff < 0 || diff > 5*60*1000 {
			continue
		}
		guardID := "quiz_time_reminder_" + week + "_date" + itoa(i+1)
		var exists bool
		_ = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM admin_settings WHERE id=$1)`, guardID).Scan(&exists)
		if exists {
			continue
		}
		payload := map[string]any{"type": "broadcast", "title": "Quiz Time!",
			"message":     "Your weekly mock test is live! Open the app and start now.",
			"broadcastId": "quiz-time-" + itoa(int(now.UnixMilli()))}
		for _, sub := range subs {
			ok, gone, _ := s.sender.Send(sub.endpoint, sub.p256dh, sub.auth, payload, 3600)
			if gone {
				s.pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE student_id=$1`, sub.studentID)
				continue
			}
			if ok {
				sent++
			}
		}
		s.pool.Exec(ctx, `INSERT INTO admin_settings (id, data) VALUES ($1,'{"sentAt":"`+now.UTC().Format("2006-01-02T15:04:05Z")+`"}') ON CONFLICT (id) DO NOTHING`, guardID)
	}
	return sent, nil
}
