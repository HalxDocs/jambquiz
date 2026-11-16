package notify

import (
	"context"
	"log"
	"os"
	"sync"
	"time"

	"github.com/274lab/server/internal/modules/boards"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Scheduler runs the periodic jobs inside the API process.
//
// These jobs were written to be invoked externally as `worker <job>`, but
// nothing scheduled them. On Firebase they ran as Cloud Functions on a
// schedule; after the Go cutover that scheduling was never recreated, so no
// scheduled push, SMS, leaderboard refresh or week advance ever fired — only
// manual admin actions produced anything. The leaderboard cache was still
// showing data from the cutover date as a result.
//
// The intervals below mirror the schedules the Firebase functions ran on.
//
// Each job is guarded by a Postgres advisory lock, so running more than one
// API replica cannot double-send or double-count.
type Scheduler struct {
	svc    *Service
	boards *boards.Service
	pool   *pgxpool.Pool
}

type scheduledJob struct {
	name string
	// interval is how often the job is considered.
	interval time.Duration
	// initial delays the first run so a restart does not immediately fire a
	// burst of reminders.
	initial time.Duration
	run     func(context.Context) string
}

// StartScheduler begins the periodic jobs and returns immediately.
func StartScheduler(ctx context.Context, svc *Service, pool *pgxpool.Pool) <-chan struct{} {
	done := make(chan struct{})
	if svc == nil || pool == nil {
		close(done)
		return done
	}
	s := &Scheduler{svc: svc, boards: boards.NewService(pool), pool: pool}
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		s.heartbeat(ctx)
	}()
	jobs := []scheduledJob{
		{
			// Drain a small bounded batch frequently so scheduled pushes survive
			// a process restart and transient push-service failures.
			name: "push-outbox", interval: 15 * time.Second, initial: 10 * time.Second,
			run: func(ctx context.Context) string {
				report, err := s.svc.DrainPushOutbox(ctx, pushOutboxBatchSize)
				if err != nil {
					return "error: " + err.Error()
				}
				if report.Failed > 0 {
					return "error: " + report.String()
				}
				return report.String()
			},
		},
		{
			// Fires within 5 minutes after each quiz start.
			name: "quiz-time", interval: time.Minute, initial: 20 * time.Second,
			run: func(ctx context.Context) string {
				n, err := s.svc.RunQuizTime(ctx, time.Now().UTC())
				return fmtCount("queued", n, err)
			},
		},
		{
			// The 2h/1.5h/15m/5m reminder windows are only a minute wide, so
			// this has to be polled every minute or most reminders are missed.
			name: "quiz-reminders", interval: time.Minute, initial: 40 * time.Second,
			run: func(ctx context.Context) string {
				n, err := s.svc.RunQuizReminders(ctx, time.Now().UTC())
				return fmtCount("queued", n, err)
			},
		},
		{
			// Polled often but a student only receives a key point every two
			// hours — the per-student guard in notification_state decides.
			name: "keypoints", interval: 15 * time.Minute, initial: 3 * time.Minute,
			run: func(ctx context.Context) string {
				n, err := s.svc.RunKeyPoints(ctx, time.Now().UTC())
				return fmtCount("queued", n, err)
			},
		},
		{
			// Rebuilds leaderboard_cache, which the leaderboard page reads.
			name: "leaderboard", interval: 15 * time.Minute, initial: 2 * time.Minute,
			run: func(ctx context.Context) string {
				if err := s.boards.ComputeLeaderboard(ctx); err != nil {
					return "error: " + err.Error()
				}
				return "ok"
			},
		},
		{
			name: "public-stats", interval: 15 * time.Minute, initial: 2 * time.Minute,
			run: func(ctx context.Context) string {
				if err := s.boards.RefreshPublicStats(ctx); err != nil {
					return "error: " + err.Error()
				}
				return "ok"
			},
		},
		{
			name: "absent-sms", interval: 5 * time.Minute, initial: 4 * time.Minute,
			run: func(ctx context.Context) string {
				n, err := s.svc.RunAbsentSMS(ctx, time.Now().UTC())
				return fmtCount("sent", n, err)
			},
		},
		{
			name: "quiz-sms", interval: 5 * time.Minute, initial: 4 * time.Minute,
			run: func(ctx context.Context) string {
				n, err := s.svc.RunQuizSMSReport(ctx, time.Now().UTC())
				return fmtCount("sent", n, err)
			},
		},
		{
			// Nudges lapsed students every 48h during the day (WAT). The job
			// itself decides who is due and when the campaign ends.
			name: "renewal-nudges", interval: 15 * time.Minute, initial: 6 * time.Minute,
			run: func(ctx context.Context) string {
				n, err := s.svc.RunRenewalNudges(ctx, time.Now().UTC())
				return fmtCount("queued", n, err)
			},
		},
		{
			name: "scheduler-maintenance", interval: 24 * time.Hour, initial: 30 * time.Minute,
			run: func(ctx context.Context) string {
				if err := s.maintainSchedulerState(ctx); err != nil {
					return "error: " + err.Error()
				}
				return "ok"
			},
		},
		{
			name: "advance-week", interval: 15 * time.Minute, initial: 8 * time.Minute,
			run: func(ctx context.Context) string {
				// A week the admin set by hand stays under their control: the
				// scheduler must not roll it forward on its own.
				if s.svc.isManualWeek(ctx) {
					return "skipped (week set manually)"
				}
				next, err := s.svc.RunAdvanceWeek(ctx, time.Now().UTC())
				if err != nil {
					return "error: " + err.Error()
				}
				if next == "" {
					return "no change"
				}
				return "advanced to " + next
			},
		},
	}
	for _, j := range jobs {
		wg.Add(1)
		go func(job scheduledJob) {
			defer wg.Done()
			s.loop(ctx, job)
		}(j)
	}
	log.Printf("[scheduler] started %d periodic jobs", len(jobs))
	go func() {
		wg.Wait()
		close(done)
	}()
	return done
}

func fmtCount(label string, n int, err error) string {
	if err != nil {
		return label + "=0 error: " + err.Error()
	}
	return label + "=" + itoa(n)
}

func (s *Scheduler) loop(ctx context.Context, j scheduledJob) {
	select {
	case <-ctx.Done():
		return
	case <-time.After(j.initial):
	}
	for {
		s.runLocked(ctx, j)
		select {
		case <-ctx.Done():
			return
		case <-time.After(j.interval):
		}
	}
}

// runLocked runs a job while holding an advisory lock, so a second API
// replica skips it rather than sending the same notifications twice.
func (s *Scheduler) runLocked(ctx context.Context, j scheduledJob) {
	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		log.Printf("[scheduler] %s: acquire: %v", j.name, err)
		return
	}
	defer conn.Release()

	key := "274lab-job:" + j.name
	var locked bool
	if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtext($1))`, key).Scan(&locked); err != nil {
		log.Printf("[scheduler] %s: lock: %v", j.name, err)
		return
	}
	if !locked {
		return // another replica is running this job
	}
	defer conn.Exec(ctx, `SELECT pg_advisory_unlock(hashtext($1))`, key)

	started := time.Now()
	var runID int64
	if err := s.pool.QueryRow(ctx, `INSERT INTO scheduler_job_runs (job_name, worker_id, status)
		VALUES ($1,$2,'running') RETURNING id`, j.name, schedulerWorkerID()).Scan(&runID); err != nil {
		log.Printf("[scheduler] %s: could not record start: %v", j.name, err)
	}

	runCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	summary := j.run(runCtx)
	elapsed := time.Since(started)
	status := "succeeded"
	errText := ""
	if len(summary) >= len("error: ") && summary[:len("error: ")] == "error: " {
		status = "failed"
		errText = summary[len("error: "):]
	}
	if runID != 0 {
		if _, err := s.pool.Exec(ctx, `UPDATE scheduler_job_runs
			SET status=$2, finished_at=now(), duration_ms=$3, summary=$4, error=$5
			WHERE id=$1`, runID, status, elapsed.Milliseconds(), truncateRunText(summary), truncateRunText(errText)); err != nil {
			log.Printf("[scheduler] %s: could not record completion: %v", j.name, err)
		}
	}
	log.Printf("[scheduler] %s: %s (%s)", j.name, summary, elapsed.Round(time.Millisecond))
}

func schedulerWorkerID() string {
	host, err := os.Hostname()
	if err != nil || host == "" {
		host = "unknown"
	}
	return host + "-" + itoa(os.Getpid())
}

func (s *Scheduler) heartbeat(ctx context.Context) {
	workerID := schedulerWorkerID()
	role := os.Getenv("SERVICE_ROLE")
	if role == "" {
		role = "api"
	}
	pulse := func() {
		if _, err := s.pool.Exec(ctx, `INSERT INTO scheduler_workers (worker_id, role, started_at, last_seen_at)
			VALUES ($1,$2,now(),now())
			ON CONFLICT (worker_id) DO UPDATE SET role=$2, last_seen_at=now()`, workerID, role); err != nil {
			log.Printf("[scheduler] heartbeat failed: %v", err)
			return
		}
		_, _ = s.pool.Exec(ctx, `DELETE FROM scheduler_workers WHERE last_seen_at < now() - interval '7 days'`)
	}
	pulse()
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			cleanupCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_, _ = s.pool.Exec(cleanupCtx, `DELETE FROM scheduler_workers WHERE worker_id=$1`, workerID)
			return
		case <-ticker.C:
			pulse()
		}
	}
}

func truncateRunText(text string) string {
	const max = 2000
	if len(text) > max {
		return text[:max]
	}
	return text
}

func (s *Scheduler) maintainSchedulerState(ctx context.Context) error {
	for {
		tag, err := s.pool.Exec(ctx, `WITH old_runs AS (
			SELECT id FROM scheduler_job_runs
			WHERE started_at < now() - interval '90 days'
			ORDER BY id LIMIT 5000
		)
		DELETE FROM scheduler_job_runs r USING old_runs
		WHERE r.id=old_runs.id`)
		if err != nil {
			return err
		}
		if tag.RowsAffected() < 5000 {
			break
		}
	}
	for {
		tag, err := s.pool.Exec(ctx, `WITH old_deliveries AS (
			SELECT id FROM push_outbox
			WHERE status IN ('sent','failed','gone','stale','cancelled')
			  AND updated_at < now() - interval '90 days'
			ORDER BY id LIMIT 5000
		)
		DELETE FROM push_outbox d USING old_deliveries
		WHERE d.id=old_deliveries.id`)
		if err != nil {
			return err
		}
		if tag.RowsAffected() < 5000 {
			break
		}
	}
	_, err := s.pool.Exec(ctx, `DELETE FROM scheduler_workers WHERE last_seen_at < now() - interval '7 days'`)
	return err
}
