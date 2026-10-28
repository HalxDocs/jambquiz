package notify

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type keyPoint struct {
	ID         string
	Subject    string
	Point      string
	Week       string
	IsQuestion bool
}

func (s *Service) allKeyPoints(ctx context.Context, week string, subjects []string) []keyPoint {
	var data []byte
	if err := s.pool.QueryRow(ctx, `SELECT topics FROM topics WHERE week=$1`, week).Scan(&data); err != nil {
		return nil
	}
	var topics map[string]struct {
		KeyPoints []string `json:"keyPoints"`
	}
	if err := json.Unmarshal(data, &topics); err != nil {
		return nil
	}
	out := []keyPoint{}
	for _, subject := range subjects {
		t, ok := topics[subject]
		if !ok {
			continue
		}
		for i, kp := range t.KeyPoints {
			kp = strings.TrimSpace(kp)
			if kp == "" {
				continue
			}
			out = append(out, keyPoint{
				ID:         week + "-" + subject + "-" + itoa(i),
				Subject:    subject,
				Point:      kp,
				Week:       week,
				IsQuestion: strings.HasSuffix(kp, "?"),
			})
		}
	}
	return out
}

func (s *Service) weakSubjects(ctx context.Context, subjects []string, studentID string) []string {
	best := map[string]int{}
	has := map[string]bool{}
	rows, err := s.pool.Query(ctx, `SELECT subject, score FROM scores WHERE student_id=$1`, studentID)
	if err == nil {
		for rows.Next() {
			var subj string
			var score int
			if err := rows.Scan(&subj, &score); err == nil {
				if !has[subj] || score > best[subj] {
					best[subj] = score
					has[subj] = true
				}
			}
		}
		rows.Close()
	}
	out := []string{}
	for _, sub := range subjects {
		if !has[sub] || best[sub] < 50 {
			out = append(out, sub)
		}
	}
	return out
}

// maxTimesPerPoint mirrors MAX_TIMES_PER_POINT in the Firebase function: a
// point is retired from the rotation after it has been pushed three times.
const maxTimesPerPoint = 3

// selectNextPoint walks the points this student has not yet seen three times,
// picking the next one in order. It returns nil when every point is retired,
// which tells the caller to reset the cycle.
//
// The Firebase original was `available[currentCycleIndex % available.length]`;
// keeping the index modulo the *available* list is what stops a retired point
// from being pushed a fourth time.
func selectNextPoint(eligible []keyPoint, seen map[string]int, cycle int) *keyPoint {
	avail := []keyPoint{}
	for _, p := range eligible {
		if seen[p.ID] < maxTimesPerPoint {
			avail = append(avail, p)
		}
	}
	if len(avail) == 0 {
		return nil
	}
	next := avail[cycle%len(avail)]
	return &next
}

// RunKeyPoints delivers one rotated key point per eligible subscriber.
func (s *Service) RunKeyPoints(ctx context.Context, now time.Time) (int, error) {
	if s.notificationsDisabled(ctx) {
		return 0, nil
	}
	if !s.sender.Configured() {
		return 0, nil
	}
	week := s.activeWeek(ctx)
	sent := 0
	stateFailed := 0
	var gone, stale []string
	attempted := 0
	for _, sub := range s.allSubs(ctx) {
		if !s.eligibleSubscriber(ctx, sub.studentID, now) {
			continue
		}
		var subjects []string
		if err := s.pool.QueryRow(ctx, `SELECT subjects FROM students WHERE id=$1`, sub.studentID).Scan(&subjects); err != nil || len(subjects) == 0 {
			continue
		}
		var seenJSON []byte
		var cycle int
		var patches bool
		// selected_patch_subjects is NOT NULL in Postgres, so a student with no
		// notification_state row yet has to start from an empty slice rather
		// than nil: pgx encodes a nil slice as SQL NULL, and the write below
		// then fails with 23502. That failure used to be swallowed, so a new
		// subscriber was sent the first key point every two hours forever
		// because last_notified_at was never stored.
		patchSubs := []string{}
		var lastNotified *time.Time
		err := s.pool.QueryRow(ctx, `SELECT seen_points, current_cycle_index, patches_active,
			COALESCE(selected_patch_subjects, '{}'::text[]), last_notified_at
			FROM notification_state WHERE student_id=$1`,
			sub.studentID).Scan(&seenJSON, &cycle, &patches, &patchSubs, &lastNotified)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			// First key point for this student; zero values are correct.
		case err != nil:
			log.Printf("[push] keypoint state read failed for %s: %v", sub.studentID, err)
			continue
		}
		// One key point every two hours per student. The job is polled far
		// more often than that, so this guard is what sets the cadence — the
		// Firebase function it replaces ran on "every 2 hours" and a student
		// is meant to work through the points slowly, not every half hour.
		if lastNotified != nil && now.Sub(*lastNotified) < 2*time.Hour {
			continue
		}
		all := s.allKeyPoints(ctx, week, subjects)
		if len(all) == 0 {
			continue
		}
		eligible := all
		if patches {
			if len(patchSubs) > 0 {
				filtered := []keyPoint{}
				for _, p := range all {
					for _, ps := range patchSubs {
						if p.Subject == ps {
							filtered = append(filtered, p)
							break
						}
					}
				}
				if len(filtered) > 0 {
					eligible = filtered
				}
			} else {
				weak := map[string]bool{}
				for _, w := range s.weakSubjects(ctx, subjects, sub.studentID) {
					weak[w] = true
				}
				filtered := []keyPoint{}
				for _, p := range all {
					if weak[p.Subject] {
						filtered = append(filtered, p)
					}
				}
				if len(filtered) > 0 {
					eligible = filtered
				}
			}
		}
		seen := map[string]int{}
		_ = json.Unmarshal(nullJSON(seenJSON), &seen)
		next := selectNextPoint(eligible, seen, cycle)
		if next == nil {
			reset := map[string]int{}
			for _, p := range eligible {
				reset[p.ID] = 0
			}
			rj, _ := json.Marshal(reset)
			s.pool.Exec(ctx, `INSERT INTO notification_state (student_id, seen_points, current_cycle_index, updated_at)
				VALUES ($1,$2,0,now()) ON CONFLICT (student_id) DO UPDATE
				SET seen_points=$2, current_cycle_index=0, updated_at=now()`, sub.studentID, rj)
			continue
		}
		payload := map[string]any{"point": next.Point, "subject": next.Subject,
			"id": next.ID, "week": next.Week, "isQuestion": next.IsQuestion}
		res := s.sender.Send(sub.endpoint, sub.p256dh, sub.auth, payload, 86400)
		attempted++
		if res.Gone {
			gone = append(gone, sub.studentID)
			continue
		}
		if res.Stale {
			stale = append(stale, sub.studentID)
			continue
		}
		if !res.Sent {
			continue
		}
		sent++
		seen[next.ID]++
		cycle = (cycle + 1) % len(eligible)
		sj, _ := json.Marshal(seen)
		if _, err := s.pool.Exec(ctx, `INSERT INTO notification_state
			(student_id, seen_points, current_cycle_index, patches_active, selected_patch_subjects, last_notified_at, updated_at)
			VALUES ($1,$2,$3,$4,COALESCE($5,'{}'::text[]),$6,now())
			ON CONFLICT (student_id) DO UPDATE SET seen_points=$2, current_cycle_index=$3,
			patches_active=$4, selected_patch_subjects=COALESCE($5,'{}'::text[]),
			last_notified_at=$6, updated_at=now()`,
			sub.studentID, sj, cycle, patches, patchSubs, now); err != nil {
			stateFailed++
			log.Printf("[push] keypoint state write failed for %s: %v", sub.studentID, err)
		}
	}
	s.pruneSubscriptions(ctx, gone, stale, attempted)
	if stateFailed > 0 {
		log.Printf("[push] keypoints: %d of %d delivered point(s) could not be recorded; those students will be sent the same point again", stateFailed, sent)
	}
	return sent, nil
}

func (s *Service) notificationsDisabled(ctx context.Context) bool {
	var data []byte
	if err := s.pool.QueryRow(ctx, `SELECT data FROM admin_settings WHERE id='notifications'`).Scan(&data); err != nil {
		return false
	}
	var d struct {
		Enabled *bool `json:"enabled"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.Enabled == nil {
		return false
	}
	return !*d.Enabled
}

func nullJSON(b []byte) []byte {
	if len(b) == 0 {
		return []byte("{}")
	}
	return b
}
