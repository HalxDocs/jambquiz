// Command worker runs one scheduled job and exits, or runs the long-lived
// scheduler when invoked with "scheduler".
// Usage: worker <scheduler|push-outbox|retry-pushes|keypoints|quiz-reminders|quiz-time|renewal-nudges|advance-week|absent-sms|quiz-sms|leaderboard|public-stats>
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/274lab/server/internal/config"
	"github.com/274lab/server/internal/db"
	"github.com/274lab/server/internal/modules/boards"
	"github.com/274lab/server/internal/modules/notify"
	"github.com/jackc/pgx/v5/pgxpool"
)

func boardsSvc(ctx context.Context, pool *pgxpool.Pool, job string) error {
	svc := boards.NewService(pool)
	switch job {
	case "leaderboard":
		return svc.ComputeLeaderboard(ctx)
	default:
		return svc.RefreshPublicStats(ctx)
	}
}

func main() {
	if len(os.Args) < 2 {
		log.Fatalf("usage: worker <scheduler|push-outbox|retry-pushes|keypoints|quiz-reminders|quiz-time|renewal-nudges|advance-week|absent-sms|quiz-sms|leaderboard|public-stats>")
	}
	job := os.Args[1]
	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[worker] db: %v", err)
	}
	defer pool.Close()
	svc := notify.NewService(pool, notify.Config{
		VapidPublic: cfg.VapidPublic, VapidPrivate: cfg.VapidPrivate,
		VapidSubject: cfg.VapidSubject, TermiiKey: cfg.TermiiKey, TermiiSender: cfg.TermiiSender,
	})
	if job == "scheduler" {
		done := notify.StartScheduler(ctx, svc, pool)
		log.Printf("[worker] scheduler process started")
		<-ctx.Done()
		log.Printf("[worker] shutting down scheduler")
		select {
		case <-done:
		case <-time.After(10 * time.Second):
			log.Printf("[worker] scheduler shutdown timed out")
		}
		return
	}
	now := time.Now().UTC()
	start := time.Now()
	var out string
	switch job {
	case "keypoints":
		var sent int
		sent, err = svc.RunKeyPoints(ctx, now)
		out = fmt.Sprintf("queued=%d", sent)
	case "quiz-reminders":
		var sent int
		sent, err = svc.RunQuizReminders(ctx, now)
		out = fmt.Sprintf("queued=%d", sent)
	case "quiz-time":
		var sent int
		sent, err = svc.RunQuizTime(ctx, now)
		out = fmt.Sprintf("queued=%d", sent)
	case "renewal-nudges":
		var sent int
		sent, err = svc.RunRenewalNudges(ctx, now)
		out = fmt.Sprintf("queued=%d", sent)
	case "push-outbox":
		var report notify.PushDrainReport
		report, err = svc.DrainPushOutbox(ctx, 0)
		out = report.String()
	case "retry-pushes":
		var retried int
		retried, err = svc.RetryFailedPushes(ctx, 0)
		out = fmt.Sprintf("requeued=%d", retried)
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
	case "leaderboard":
		err = boardsSvc(ctx, pool, "leaderboard")
		out = "ok"
	case "public-stats":
		err = boardsSvc(ctx, pool, "public-stats")
		out = "ok"
	default:
		log.Fatalf("unknown job %q", job)
	}
	if err != nil {
		log.Fatalf("[worker:%s] %v", job, err)
	}
	log.Printf("[worker:%s] %s elapsed=%s", job, out, time.Since(start).Round(time.Millisecond))
}
