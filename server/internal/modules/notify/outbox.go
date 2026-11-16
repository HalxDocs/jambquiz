package notify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/274lab/server/pkg/push"
)

const (
	pushOutboxBatchSize = 8
	pushOutboxWorkers   = 8
	pushOutboxMaxTries  = 8
)

type pushOutboxItem struct {
	id            int64
	deliveryKey   string
	studentID     string
	endpoint      string
	p256dh        string
	auth          string
	kind          string
	campaignCount int
	payload       []byte
	ttl           int
	attempts      int
	createdAt     time.Time
}

type pushOutboxOutcome struct {
	report    PushDrainReport
	studentID string
	gone      bool
	stale     bool
	err       error
}

type directPushTask struct {
	sub     subscription
	payload any
	ttl     int
}

type directPushResult struct {
	sub subscription
	res push.Result
}

type PushDrainReport struct {
	Claimed   int `json:"claimed"`
	Sent      int `json:"sent"`
	Retried   int `json:"retried"`
	Failed    int `json:"failed"`
	Gone      int `json:"gone"`
	Stale     int `json:"stale"`
	Cancelled int `json:"cancelled"`
}

func (r PushDrainReport) String() string {
	return fmt.Sprintf("claimed=%d sent=%d retried=%d failed=%d gone=%d stale=%d cancelled=%d",
		r.Claimed, r.Sent, r.Retried, r.Failed, r.Gone, r.Stale, r.Cancelled)
}

// enqueuePush stores a stable-keyed notification before delivery. If a job
// crashes after enqueueing, the next pass sees the same key instead of
// creating a second push.
func (s *Service) enqueuePush(ctx context.Context, deliveryKey string, sub subscription, payload any, ttl int, kind string, campaignCount int) (bool, error) {
	if deliveryKey == "" || sub.studentID == "" || sub.endpoint == "" {
		return false, errBadInput
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return false, err
	}
	if ttl <= 0 {
		ttl = 3600
	}
	var sequence any
	if campaignCount > 0 {
		sequence = campaignCount
	}
	tag, err := s.pool.Exec(ctx, `INSERT INTO push_outbox
		(delivery_key, student_id, endpoint, p256dh, auth, kind, campaign_count, payload, ttl_seconds)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (delivery_key) DO NOTHING`,
		deliveryKey, sub.studentID, sub.endpoint, sub.p256dh, sub.auth, kind, sequence, raw, ttl)
	if err != nil {
		return false, err
	}
	if tag.RowsAffected() > 0 {
		return true, nil
	}

	var status, endpoint, p256dh, auth string
	err = s.pool.QueryRow(ctx, `SELECT status, endpoint, p256dh, auth
		FROM push_outbox WHERE delivery_key=$1`, deliveryKey).
		Scan(&status, &endpoint, &p256dh, &auth)
	if err != nil {
		return false, err
	}

	credentialsChanged := endpoint != sub.endpoint || p256dh != sub.p256dh || auth != sub.auth
	requeue := status == "cancelled" ||
		((status == "gone" || status == "stale") && credentialsChanged)
	if requeue {
		_, err = s.pool.Exec(ctx, `UPDATE push_outbox SET
			endpoint=$2, p256dh=$3, auth=$4, payload=$5, ttl_seconds=$6,
			status='queued', attempts=0, next_attempt_at=now(), locked_at=NULL,
			last_error='', created_at=now(), updated_at=now()
			WHERE delivery_key=$1 AND status=$7`,
			deliveryKey, sub.endpoint, sub.p256dh, sub.auth, raw, ttl, status)
		if err != nil {
			return false, err
		}
		return true, nil
	}
	return status == "queued" || status == "sending" || status == "sent", nil
}

// DrainPushOutbox claims a bounded batch and delivers it with bounded
// concurrency. Expired leases are reclaimed if a worker died while sending.
func (s *Service) DrainPushOutbox(ctx context.Context, limit int) (PushDrainReport, error) {
	report := PushDrainReport{}
	if limit <= 0 || limit > pushOutboxBatchSize {
		limit = pushOutboxBatchSize
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return report, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `WITH picked AS (
		SELECT id FROM push_outbox
		WHERE (status='queued' AND next_attempt_at <= now())
		   OR (status='sending' AND locked_at < now() - interval '2 minutes')
		ORDER BY next_attempt_at, id
		LIMIT $1
		FOR UPDATE SKIP LOCKED
	)
	UPDATE push_outbox o SET status='sending', attempts=o.attempts+1,
		locked_at=now(), updated_at=now()
	FROM picked WHERE o.id=picked.id
	RETURNING o.id, o.delivery_key, o.student_id, o.endpoint, o.p256dh, o.auth,
		o.kind, COALESCE(o.campaign_count,0), o.payload, o.ttl_seconds, o.attempts, o.created_at`, limit)
	if err != nil {
		return report, err
	}
	items := make([]pushOutboxItem, 0, limit)
	for rows.Next() {
		var item pushOutboxItem
		if err := rows.Scan(&item.id, &item.deliveryKey, &item.studentID, &item.endpoint,
			&item.p256dh, &item.auth, &item.kind, &item.campaignCount, &item.payload,
			&item.ttl, &item.attempts, &item.createdAt); err != nil {
			rows.Close()
			return report, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return report, err
	}
	rows.Close()
	if err := tx.Commit(ctx); err != nil {
		return report, err
	}
	report.Claimed = len(items)
	if len(items) == 0 {
		_, _ = s.pool.Exec(ctx, `DELETE FROM push_outbox
			WHERE status IN ('sent','failed','gone','stale','cancelled')
			  AND updated_at < now() - interval '90 days'`)
		return report, nil
	}

	results := make(chan pushOutboxOutcome, len(items))
	work := make(chan pushOutboxItem)
	workers := pushOutboxWorkers
	if workers > len(items) {
		workers = len(items)
	}
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for item := range work {
				results <- s.deliverOutboxItem(ctx, item)
			}
		}()
	}
	go func() {
		defer close(work)
		for _, item := range items {
			select {
			case <-ctx.Done():
				return
			case work <- item:
			}
		}
	}()
	go func() {
		wg.Wait()
		close(results)
	}()

	var gone, stale []string
	attempted := 0
	var processErr error
	for result := range results {
		report.Sent += result.report.Sent
		report.Retried += result.report.Retried
		report.Failed += result.report.Failed
		report.Gone += result.report.Gone
		report.Stale += result.report.Stale
		report.Cancelled += result.report.Cancelled
		if result.gone {
			gone = append(gone, result.studentID)
		}
		if result.stale {
			stale = append(stale, result.studentID)
		}
		attempted += result.report.Sent + result.report.Retried + result.report.Failed + result.report.Gone + result.report.Stale
		if result.err != nil {
			processErr = errors.Join(processErr, result.err)
		}
	}
	s.pruneSubscriptions(ctx, gone, stale, attempted)
	if processErr != nil {
		return report, processErr
	}
	return report, nil
}

// RetryFailedPushes requeues failed and stale deliveries after an operator
// fixes the underlying push-service or VAPID configuration issue.
func (s *Service) RetryFailedPushes(ctx context.Context, limit int) (int, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	tag, err := s.pool.Exec(ctx, `WITH retry AS (
		SELECT id FROM push_outbox WHERE status IN ('failed','stale')
		ORDER BY updated_at, id LIMIT $1
		FOR UPDATE SKIP LOCKED
	)
	UPDATE push_outbox d SET status='queued', attempts=0, next_attempt_at=now(),
		locked_at=NULL, last_error='', updated_at=now()
	FROM retry WHERE d.id=retry.id`, limit)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

func (s *Service) deliverOutboxItem(ctx context.Context, item pushOutboxItem) (out pushOutboxOutcome) {
	out.studentID = item.studentID
	var current bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS (
		SELECT 1 FROM push_subscriptions
		WHERE student_id=$1 AND endpoint=$2 AND keys->>'p256dh'=$3 AND keys->>'auth'=$4
	)`, item.studentID, item.endpoint, item.p256dh, item.auth).Scan(&current)
	if err != nil {
		retried, retryErr := s.retryOutbox(ctx, item, err.Error())
		out.err = retryErr
		if retried {
			out.report.Retried = 1
		} else {
			out.report.Failed = 1
		}
		return out
	}
	if !current {
		_, err = s.pool.Exec(ctx, `UPDATE push_outbox SET status='cancelled',
			locked_at=NULL, last_error='subscription changed or removed', updated_at=now()
			WHERE id=$1 AND status='sending'`, item.id)
		out.report.Cancelled = 1
		out.err = err
		return out
	}

	if item.kind == "renewal" {
		status, err := s.accessStatus(ctx, item.studentID, time.Now().UTC())
		if err != nil {
			retried, retryErr := s.retryOutbox(ctx, item, err.Error())
			out.err = retryErr
			if retried {
				out.report.Retried = 1
			} else {
				out.report.Failed = 1
			}
			return out
		}
		if status != "expired" {
			_, err = s.pool.Exec(ctx, `UPDATE push_outbox SET status='cancelled',
				locked_at=NULL, last_error='student is no longer expired', updated_at=now()
				WHERE id=$1 AND status='sending'`, item.id)
			out.report.Cancelled = 1
			out.err = err
			return out
		}
	}

	var payload any
	if err := json.Unmarshal(item.payload, &payload); err != nil {
		out.report.Failed = 1
		out.err = s.finishOutbox(ctx, item.id, "failed", err.Error(), false)
		return out
	}
	result := s.sender.SendContext(ctx, item.endpoint, item.p256dh, item.auth, payload, item.ttl)
	switch {
	case result.Gone:
		out.report.Gone = 1
		out.gone = true
		out.err = s.finishOutbox(ctx, item.id, "gone", "push endpoint returned 404/410", false)
	case result.Stale:
		out.report.Stale = 1
		out.stale = true
		out.err = s.finishOutbox(ctx, item.id, "stale", "push endpoint returned 401/403", false)
	case result.Sent:
		out.report.Sent = 1
		out.err = s.finishOutbox(ctx, item.id, "sent", "", item.kind == "renewal")
	default:
		message := "push delivery failed"
		if result.Err != nil {
			message = result.Err.Error()
		}
		if retryablePushResult(result) && item.attempts < pushOutboxMaxTries {
			out.report.Retried = 1
			retried, retryErr := s.retryOutbox(ctx, item, message)
			out.err = retryErr
			if retried {
				out.report.Retried = 1
			} else {
				out.report.Failed = 1
			}
		} else {
			out.report.Failed = 1
			out.err = s.finishOutbox(ctx, item.id, "failed", message, false)
		}
	}
	return out
}

func (s *Service) retryOutbox(ctx context.Context, item pushOutboxItem, message string) (bool, error) {
	if item.attempts >= pushOutboxMaxTries {
		return false, s.finishOutbox(ctx, item.id, "failed", message, false)
	}
	delay := pushRetryDelay(item.attempts)
	_, err := s.pool.Exec(ctx, `UPDATE push_outbox SET status='queued',
		next_attempt_at=now()+($2 * interval '1 second'), locked_at=NULL,
		last_error=$3, updated_at=now() WHERE id=$1 AND status='sending'`,
		item.id, int64(delay.Seconds()), truncateRunText(message))
	return err == nil, err
}

func (s *Service) finishOutbox(ctx context.Context, id int64, status, message string, recordRenewal bool) error {
	if recordRenewal {
		_, err := s.pool.Exec(ctx, `WITH delivered AS (
			UPDATE push_outbox SET status='sent', sent_at=now(),
				locked_at=NULL, last_error='', updated_at=now()
			WHERE id=$1 AND status='sending'
			RETURNING student_id, campaign_count, created_at
		)
		INSERT INTO renewal_nudges (student_id, first_sent_at, last_sent_at, sent_count)
		SELECT student_id, created_at, now(), campaign_count FROM delivered
		WHERE campaign_count IS NOT NULL
		ON CONFLICT (student_id) DO UPDATE SET
			last_sent_at=now(),
			sent_count=GREATEST(renewal_nudges.sent_count, EXCLUDED.sent_count)`,
			id)
		return err
	}
	_, err := s.pool.Exec(ctx, `UPDATE push_outbox SET status=$2, sent_at=CASE WHEN $2='sent' THEN now() ELSE sent_at END,
		locked_at=NULL, last_error=$3, updated_at=now() WHERE id=$1 AND status='sending'`,
		id, status, truncateRunText(message))
	return err
}

func retryablePushResult(result push.Result) bool {
	return result.Status == 0 || result.Status == 429 || result.Status >= 500
}

func pushRetryDelay(attempt int) time.Duration {
	switch {
	case attempt <= 1:
		return 15 * time.Second
	case attempt == 2:
		return 30 * time.Second
	case attempt == 3:
		return time.Minute
	case attempt == 4:
		return 2 * time.Minute
	case attempt == 5:
		return 4 * time.Minute
	case attempt == 6:
		return 8 * time.Minute
	default:
		return 15 * time.Minute
	}
}

// sendDirectBatch handles interactive push actions (broadcast/test) with a
// small concurrency cap and short transient retries. Scheduled fan-outs use
// the persistent outbox instead.
func (s *Service) sendDirectBatch(ctx context.Context, tasks []directPushTask) []directPushResult {
	results := make([]directPushResult, len(tasks))
	if len(tasks) == 0 {
		return results
	}
	workers := pushOutboxWorkers
	if workers > len(tasks) {
		workers = len(tasks)
	}
	work := make(chan int)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for index := range work {
				task := tasks[index]
				res := s.sender.SendContext(ctx, task.sub.endpoint, task.sub.p256dh, task.sub.auth, task.payload, task.ttl)
				for attempt := 1; attempt < 3 && retryablePushResult(res); attempt++ {
					timer := time.NewTimer(time.Duration(attempt) * 250 * time.Millisecond)
					select {
					case <-ctx.Done():
						timer.Stop()
						attempt = 3
					case <-timer.C:
						res = s.sender.SendContext(ctx, task.sub.endpoint, task.sub.p256dh, task.sub.auth, task.payload, task.ttl)
					}
				}
				results[index] = directPushResult{sub: task.sub, res: res}
			}
		}()
	}
	for index := range tasks {
		select {
		case <-ctx.Done():
			break
		case work <- index:
		}
	}
	close(work)
	wg.Wait()
	return results
}
