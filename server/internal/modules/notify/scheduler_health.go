package notify

import (
	"context"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ScheduledJobHealth struct {
	Name       string     `json:"name"`
	Status     string     `json:"status"`
	LastRunAt  *time.Time `json:"lastRunAt,omitempty"`
	DurationMS int64      `json:"durationMs,omitempty"`
	Stale      bool       `json:"stale"`
}

type SchedulerHealth struct {
	OK                bool                 `json:"ok"`
	Jobs              []ScheduledJobHealth `json:"jobs"`
	Stale             []string             `json:"staleJobs"`
	Failed            []string             `json:"failedJobs"`
	Unknown           []string             `json:"unknownJobs"`
	PendingDeliveries int                  `json:"pendingDeliveries"`
	FailedDeliveries  int                  `json:"failedDeliveries"`
	ActiveWorkers     int                  `json:"activeWorkers"`
}

var expectedScheduledJobs = map[string]time.Duration{
	"push-outbox":           2 * time.Minute,
	"quiz-time":             5 * time.Minute,
	"quiz-reminders":        5 * time.Minute,
	"absent-sms":            20 * time.Minute,
	"quiz-sms":              20 * time.Minute,
	"keypoints":             45 * time.Minute,
	"leaderboard":           45 * time.Minute,
	"public-stats":          45 * time.Minute,
	"renewal-nudges":        45 * time.Minute,
	"scheduler-maintenance": 48 * time.Hour,
	"advance-week":          45 * time.Minute,
}

// ReadSchedulerHealth returns the latest persisted run per scheduled job.
// Unknown jobs are reported but do not mark the service unhealthy during
// startup or while a new worker is being rolled out.
func ReadSchedulerHealth(ctx context.Context, pool *pgxpool.Pool, now time.Time) (SchedulerHealth, error) {
	health := SchedulerHealth{
		OK:      true,
		Jobs:    []ScheduledJobHealth{},
		Stale:   []string{},
		Failed:  []string{},
		Unknown: []string{},
	}

	rows, err := pool.Query(ctx, `SELECT DISTINCT ON (job_name)
		job_name, status, started_at, finished_at, duration_ms
		FROM scheduler_job_runs
		ORDER BY job_name, started_at DESC`)
	if err != nil {
		return health, err
	}
	defer rows.Close()

	latest := make(map[string]ScheduledJobHealth, len(expectedScheduledJobs))
	for rows.Next() {
		var job ScheduledJobHealth
		var started time.Time
		var finished *time.Time
		if err := rows.Scan(&job.Name, &job.Status, &started, &finished, &job.DurationMS); err != nil {
			return health, err
		}
		last := started
		if finished != nil {
			last = *finished
		}
		job.LastRunAt = &last
		job.Stale = schedulerJobStale(job.Name, job.Status, last, now)
		latest[job.Name] = job
	}
	if err := rows.Err(); err != nil {
		return health, err
	}
	rows.Close()

	if err := pool.QueryRow(ctx, `SELECT
		count(*) FILTER (WHERE status IN ('queued','sending')),
		count(*) FILTER (WHERE status IN ('failed','stale'))
		FROM push_outbox`).Scan(&health.PendingDeliveries, &health.FailedDeliveries); err != nil {
		return health, err
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM scheduler_workers
		WHERE last_seen_at > now() - interval '90 seconds'`).Scan(&health.ActiveWorkers); err != nil {
		return health, err
	}
	if health.ActiveWorkers == 0 {
		health.OK = false
	}
	if health.FailedDeliveries > 0 {
		health.OK = false
	}

	for name := range expectedScheduledJobs {
		job, exists := latest[name]
		if !exists {
			health.Unknown = append(health.Unknown, name)
			continue
		}
		if job.Status == "failed" {
			health.Failed = append(health.Failed, name)
			health.OK = false
		}
		if job.Stale {
			health.Stale = append(health.Stale, name)
			health.OK = false
		}
		health.Jobs = append(health.Jobs, job)
	}

	sort.Slice(health.Jobs, func(i, j int) bool { return health.Jobs[i].Name < health.Jobs[j].Name })
	sort.Strings(health.Stale)
	sort.Strings(health.Failed)
	sort.Strings(health.Unknown)
	return health, nil
}

func schedulerJobStale(name, status string, lastRun, now time.Time) bool {
	threshold, expected := expectedScheduledJobs[name]
	return expected && (status == "running" || status == "succeeded" || status == "failed") &&
		now.Sub(lastRun) > threshold
}
