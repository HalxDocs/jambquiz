// Command worker runs one scheduled job and exits.
// Usage: go run ./cmd/worker <keypoints|quiz-reminders|quiz-time|advance-week|absent-sms|quiz-sms>
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/274lab/server/internal/config"
	"github.com/274lab/server/internal/db"
	"github.com/274lab/server/internal/modules/notify"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatalf("usage: worker <keypoints|quiz-reminders|quiz-time|advance-week|absent-sms|quiz-sms>")
	}
	job := os.Args[1]
	cfg := config.Load()
	ctx := context.Background()
	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[worker] db: %v", err)
	}
	defer pool.Close()
	svc := notify.NewService(pool, notify.Config{
		VapidPublic: cfg.VapidPublic, VapidPrivate: cfg.VapidPrivate,
		VapidSubject: cfg.VapidSubject, TermiiKey: cfg.TermiiKey, TermiiSender: cfg.TermiiSender,
	})
	now := time.Now().UTC()
	start := time.Now()
	var n any
	var out string
	switch job {
	case "keypoints":
		var sent int
		sent, err = svc.RunKeyPoints(ctx, now)
		out = fmt.Sprintf("sent=%d", sent)
	case "quiz-reminders":
		var sent int
		sent, err = svc.RunQuizReminders(ctx, now)
		out = fmt.Sprintf("sent=%d", sent)
	case "quiz-time":
		var sent int
		sent, err = svc.RunQuizTime(ctx, now)
		out = fmt.Sprintf("sent=%d", sent)
	case "advance-week":
		var next string
		next, err = svc.RunAdvanceWeek(ctx, now)
		out = fmt.Sprintf("advancedTo=%q", next)
	case "absent-sms":
		var sent int
		sent, err = svc.RunAbsentSMS(ctx, now)
		out = fmt.Sprintf("sent=%d", sent)
	case "quiz-sms":
		var sent int
		sent, err = svc.RunQuizSMSReport(ctx, now)
		out = fmt.Sprintf("sent=%d", sent)
	default:
		log.Fatalf("unknown job %q", job)
	}
	if err != nil {
		log.Fatalf("[worker:%s] %v", job, err)
	}
	log.Printf("[worker:%s] %s elapsed=%s", job, out, time.Since(start).Round(time.Millisecond))
	_ = n
}
