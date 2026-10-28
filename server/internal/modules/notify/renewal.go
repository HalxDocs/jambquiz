package notify

import (
	"context"
	"fmt"
	"log"
	"time"
)

const (
	// renewalInterval is how often a lapsed student is nudged: often enough to
	// be seen, rare enough not to be spam.
	renewalInterval = 48 * time.Hour
	// renewalCampaign is how long the nudge campaign runs for one lapse. After
	// this the student is left alone until they renew and lapse again.
	renewalCampaign = 14 * 24 * time.Hour
	// renewalMaxNudges caps the campaign regardless of the interval.
	renewalMaxNudges = 5
	// Only push between 08:00 and 20:00 in Lagos (UTC+1, no daylight saving),
	// so a nudge never arrives in the middle of the night.
	renewalFirstHourUTC = 7  // 08:00 WAT
	renewalLastHourUTC  = 19 // 20:00 WAT
)

// renewalDue reports whether an expired student should be nudged now.
func renewalDue(now time.Time, firstSent, lastSent *time.Time, sentCount int) bool {
	if sentCount >= renewalMaxNudges {
		return false
	}
	if firstSent != nil && now.Sub(*firstSent) >= renewalCampaign {
		return false
	}
	if lastSent == nil {
		return true
	}
	return now.Sub(*lastSent) >= renewalInterval
}

// renewalWindowOpen reports whether it is a reasonable hour to send.
func renewalWindowOpen(now time.Time) bool {
	h := now.UTC().Hour()
	return h >= renewalFirstHourUTC && h <= renewalLastHourUTC
}

// RunRenewalNudges sends a short renewal campaign to subscribers whose access
// has lapsed.
//
// The key-point and quiz-reminder jobs intentionally target only students who
// can still use the app, which meant a student whose subscription ran out
// stopped hearing from us completely. This job is the counterweight: it does
// not unlock any content, it just tells the student their access ended and how
// to renew. Suspended accounts are never contacted.
func (s *Service) RunRenewalNudges(ctx context.Context, now time.Time) (int, error) {
	if s.notificationsDisabled(ctx) {
		return 0, nil
	}
	if !s.sender.Configured() {
		return 0, nil
	}
	if !renewalWindowOpen(now) {
		return 0, nil
	}

	sent := 0
	stateFailed := 0
	var gone, stale []string
	attempted := 0

	for _, sub := range s.allSubs(ctx) {
		status, err := s.accessStatus(ctx, sub.studentID, now)
		if err != nil || status == "suspended" {
			continue
		}
		if status != "expired" {
			// They are back inside the app. Forget the finished campaign so a
			// future lapse starts with a full set of nudges again.
			if _, err := s.pool.Exec(ctx, `DELETE FROM renewal_nudges WHERE student_id=$1`, sub.studentID); err != nil {
				log.Printf("[push] renewal reset failed for %s: %v", sub.studentID, err)
			}
			continue
		}

		var firstSent, lastSent *time.Time
		var sentCount int
		_ = s.pool.QueryRow(ctx, `SELECT first_sent_at, last_sent_at, sent_count
			FROM renewal_nudges WHERE student_id=$1`, sub.studentID).Scan(&firstSent, &lastSent, &sentCount)
		if !renewalDue(now, firstSent, lastSent, sentCount) {
			continue
		}

		next := sentCount + 1
		payload := map[string]any{
			"type":  "broadcast",
			"title": "Your 247 Chops access has ended",
			"message": "Renew for ₦800/month to keep your key points, weekly mocks " +
				"and progress tracking. Tap to open the app.",
			"broadcastId": fmt.Sprintf("renewal-%s-%d", sub.studentID, next),
		}
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

		first := now
		if firstSent != nil {
			first = *firstSent
		}
		if _, err := s.pool.Exec(ctx, `INSERT INTO renewal_nudges
			(student_id, first_sent_at, last_sent_at, sent_count)
			VALUES ($1,$2,$3,$4)
			ON CONFLICT (student_id) DO UPDATE SET last_sent_at=$3, sent_count=$4`,
			sub.studentID, first, now, next); err != nil {
			stateFailed++
			log.Printf("[push] renewal state write failed for %s: %v", sub.studentID, err)
		}
	}

	s.pruneSubscriptions(ctx, gone, stale, attempted)
	if stateFailed > 0 {
		log.Printf("[push] renewal: %d of %d nudge(s) could not be recorded", stateFailed, sent)
	}
	return sent, nil
}
