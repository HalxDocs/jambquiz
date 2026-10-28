package notify

import (
	"context"
	"log"
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
func StartScheduler(ctx context.Context, svc *Service, pool *pgxpool.Pool) {
	if svc == nil || pool == nil {
		return
	}
	s := &Scheduler{svc: svc, boards: boards.NewService(pool), pool: pool}
	jobs := []scheduledJob{
		{
			// Fires within 5 minutes after each quiz start.
			name: "quiz-time", interval: time.Minute, initial: 20 * time.Second,
			run: func(ctx context.Context) string {
				n, err := s.svc.RunQuizTime(ctx, time.Now().UTC())
				return fmtCount("sent", n, err)
			},
		},
		{
			// The 2h/1.5h/15m/5m reminder windows are only a minute wide, so
			// this has to be polled every minute or most reminders are missed.
			name: "quiz-reminders", interval: time.Minute, initial: 40 * time.Second,
			run: func(ctx context.Context) string {
				n, err := s.svc.RunQuizReminders(ctx, time.Now().UTC())
				return fmtCount("sent", n, err)
			},
		},
		{
			// Polled often but a student only receives a key point every two
			// hours — the per-student guard in notification_state decides.
			name: "keypoints", interval: 15 * time.Minute, initial: 3 * time.Minute,
			run: func(ctx context.Context) string {
				n, err := s.svc.RunKeyPoints(ctx, time.Now().UTC())
				return fmtCount("sent", n, err)
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
				return fmtCount("sent", n, err)
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
		go s.loop(ctx, j)
	}
	log.Printf("[scheduler] started %d periodic jobs", len(jobs))
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

	runCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	start := time.Now()
	summary := j.run(runCtx)
	log.Printf("[scheduler] %s: %s (%s)", j.name, summary, time.Since(start).Round(time.Millisecond))
}
