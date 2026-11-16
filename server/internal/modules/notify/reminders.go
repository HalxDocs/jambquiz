package notify

import (
	"context"
	"log"
	"time"
)

// reminderGrace is how late a reminder may still be sent. The Firebase
// function fired only inside a ±60s window, so a deploy, a restart or a
// slow database at exactly that minute dropped the reminder for good.
// Every reminder has its own guard row, so a late send can never duplicate
// one; three minutes is short enough that "starts in 5 minutes" is still
// true when it arrives.
const reminderGrace = 3 * 60 * 1000

// reminderDue reports whether the reminder that belongs `intervalMs` before
// the quiz is due, given `until` milliseconds left before the quiz starts.
// It allows one minute early and reminderGrace late.
func reminderDue(until, intervalMs int64) bool {
	if until <= 0 {
		return false
	}
	diff := until - intervalMs
	return diff <= 60*1000 && diff >= -reminderGrace
}

// RunQuizReminders queues 2h / 1.5h / 15m / 5m reminders with per-key guards.
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
	subs, err := s.allSubs(ctx)
	if err != nil {
		return 0, err
	}
	if len(subs) == 0 {
		return 0, nil
	}
	queued := 0
	var firstErr error
	for i, t := range times {
		for _, iv := range intervals {
			until := t.UnixMilli() - now.UnixMilli()
			if !reminderDue(until, iv.ms) {
				continue
			}
			key := week + "_date" + itoa(i+1) + "_" + iv.label
			var exists bool
			if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM reminder_sent WHERE key=$1)`, key).Scan(&exists); err != nil {
				firstErr = err
				continue
			}
			if exists {
				continue
			}
			keyQueued := 0
			keyFailed := false
			for _, sub := range subs {
				if !s.eligibleSubscriber(ctx, sub.studentID, now) {
					continue
				}
				payload := map[string]any{"type": "broadcast", "title": "Quiz Reminder",
					"message": iv.body, "broadcastId": "quiz-reminder-" + key}
				accepted, err := s.enqueuePush(ctx, "reminder:"+sub.studentID+":"+key, sub, payload, 3600, "quiz-reminder", 0)
				if err != nil {
					firstErr = err
					keyFailed = true
					log.Printf("[push] reminder enqueue failed for %s: %v", sub.studentID, err)
				} else if accepted {
					queued++
					keyQueued++
				}
			}
			if keyFailed {
				continue
			}
			if _, err := s.pool.Exec(ctx, `INSERT INTO reminder_sent (key, sent, sent_at) VALUES ($1,$2,now())
				ON CONFLICT (key) DO NOTHING`, key, keyQueued); err != nil {
				firstErr = err
				log.Printf("[push] reminder guard write failed for %s: %v", key, err)
			}
		}
	}
	return queued, firstErr
}

// RunQuizTime fires shortly after each quiz start. The Firebase function used
// a five-minute window; that loses the notification entirely if the API or the
// database is unavailable at that exact minute (a deploy is enough), while the
// message stays useful for as long as the quiz is open. The per-week/date guard
// keeps it at-most-once.
const quizTimeWindow = 30 * time.Minute

// quizTimeDue reports whether a quiz that started at `start` should get its
// "it's live" push now.
func quizTimeDue(now, start time.Time) bool {
	diff := now.Sub(start)
	return diff >= 0 && diff <= quizTimeWindow
}

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
	subs, err := s.allSubs(ctx)
	if err != nil {
		return 0, err
	}
	if len(subs) == 0 {
		return 0, nil
	}
	queued := 0
	var firstErr error
	for i, t := range times {
		if !quizTimeDue(now, t) {
			continue
		}
		guardID := "quiz_time_reminder_" + week + "_date" + itoa(i+1)
		var exists bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM admin_settings WHERE id=$1)`, guardID).Scan(&exists); err != nil {
			firstErr = err
			continue
		}
		if exists {
			continue
		}
		payload := map[string]any{"type": "broadcast", "title": "Quiz Time!",
			"message":     "Your weekly mock test is live! Open the app and start now.",
			"broadcastId": "quiz-time-" + week + "-date" + itoa(i+1)}
		enqueueFailed := false
		for _, sub := range subs {
			accepted, err := s.enqueuePush(ctx, "quiz-time:"+sub.studentID+":"+week+":date"+itoa(i+1),
				sub, payload, 3600, "quiz-time", 0)
			if err != nil {
				firstErr = err
				enqueueFailed = true
				log.Printf("[push] quiz-time enqueue failed for %s: %v", sub.studentID, err)
			} else if accepted {
				queued++
			}
		}
		if enqueueFailed {
			continue
		}
		if _, err := s.pool.Exec(ctx, `INSERT INTO admin_settings (id, data) VALUES ($1,'{"sentAt":"`+now.UTC().Format("2006-01-02T15:04:05Z")+`"}') ON CONFLICT (id) DO NOTHING`, guardID); err != nil {
			firstErr = err
			log.Printf("[push] quiz-time guard write failed for %s: %v", guardID, err)
		}
	}
	return queued, firstErr
}
