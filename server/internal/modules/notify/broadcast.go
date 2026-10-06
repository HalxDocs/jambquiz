package notify

import (
	"context"
	"crypto/rand"
	"fmt"
	"github.com/274lab/server/pkg/sms"
	"strings"
	"time"
)

// CreateBroadcast stores an admin announcement and fans it out over push.
func (s *Service) CreateBroadcast(ctx context.Context, title, message, target string) (string, int, error) {
	title = strings.TrimSpace(title)
	message = strings.TrimSpace(message)
	if title == "" || len(title) > 100 || message == "" || len(message) > 500 {
		return "", 0, errBadInput
	}
	if target != "paid" && target != "unpaid" {
		target = "all"
	}
	id := newID()
	now := time.Now().UTC()
	if _, err := s.pool.Exec(ctx, `INSERT INTO admin_broadcasts (id, title, message, target, created_at)
		VALUES ($1,$2,$3,$4,$5)`, id, title, message, target, now); err != nil {
		return "", 0, err
	}
	sent := s.fanOutBroadcast(ctx, id, title, message, target, now)
	return id, sent, nil
}

func (s *Service) fanOutBroadcast(ctx context.Context, id, title, message, target string, now time.Time) int {
	if !s.sender.Configured() {
		return 0
	}
	sent := 0
	for _, sub := range s.allSubs(ctx) {
		var suspended bool
		var streak int
		var subUntil *time.Time
		if err := s.pool.QueryRow(ctx, `SELECT suspended, missed_streak, subscription_until
			FROM students WHERE id=$1`, sub.studentID).Scan(&suspended, &streak, &subUntil); err != nil {
			continue
		}
		if suspended || streak >= 6 {
			continue
		}
		if target == "paid" || target == "unpaid" {
			isPaid := subUntil != nil && subUntil.After(now)
			if target == "paid" && !isPaid {
				continue
			}
			if target == "unpaid" && isPaid {
				continue
			}
		}
		payload := map[string]any{"type": "broadcast", "title": title,
			"message": message, "broadcastId": id}
		ok, gone, _ := s.sender.Send(sub.endpoint, sub.p256dh, sub.auth, payload, 86400)
		if gone {
			s.pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE student_id=$1`, sub.studentID)
			continue
		}
		if ok {
			sent++
		}
	}
	return sent
}

// TestPush fans a test key point out to every subscription.
func (s *Service) TestPush(ctx context.Context) (int, int, error) {
	if !s.sender.Configured() {
		return 0, 0, errBadInput
	}
	subs := s.allSubs(ctx)
	if len(subs) == 0 {
		return 0, 0, errNotFound
	}
	payload := map[string]any{"point": "Push notifications are working! You will receive key points every 2 hours.",
		"subject": "Test", "id": fmt.Sprintf("test-%d", time.Now().UnixMilli()), "isQuestion": false}
	sent := 0
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
	return sent, len(subs), nil
}

// TestSMS sends the canned test message (phone in any NG format).
func (s *Service) TestSMS(ctx context.Context, phone string) error {
	if s.cfg.TermiiKey == "" {
		return errNotConfigured
	}
	to := sms.Normalize(phone)
	if to == "" {
		return errBadInput
	}
	r := s.sms.Send(ctx, to, "This is a test SMS from 274Lab. Your SMS integration is working correctly!")
	if !r.OK {
		s.recordSmsFailure(ctx, to, "test sms", r.Error, "", "", "", "testSms")
		return errSendFailed(r.Error)
	}
	return nil
}

// AccountabilityIntro stores a recovery code and notifies partners.
func (s *Service) AccountabilityIntro(ctx context.Context, studentID string, phones []string) (int, error) {
	if s.cfg.TermiiKey == "" {
		return 0, errNotConfigured
	}
	var name string
	if err := s.pool.QueryRow(ctx, `SELECT name FROM students WHERE id=$1`, studentID).Scan(&name); err != nil {
		return 0, errNotFound
	}
	if name == "" {
		name = "Student"
	}
	var code [4]byte
	if _, err := rand.Read(code[:]); err != nil {
		return 0, err
	}
	recovery := fmt.Sprintf("%d%d%d%d", code[0]%10, code[1]%10, code[2]%10, code[3]%10)
	if _, err := s.pool.Exec(ctx, `UPDATE students SET recovery_code=$1, updated_at=now() WHERE id=$2`, recovery, studentID); err != nil {
		return 0, err
	}
	text := "Hi,\n\n" + name + " has started preparing for JAMB with 274Lab weekly topic-based tests and chose you as accountability partner.\n\nYour role is to support them as we update you on their weekly progress.\n\nYou make the difference.\n\nPowered by 274Lab."
	sent := 0
	for _, p := range phones {
		to := sms.Normalize(p)
		if to == "" {
			continue
		}
		r := s.sms.Send(ctx, to, text)
		if r.OK {
			sent++
		} else {
			s.recordSmsFailure(ctx, to, text, r.Error, studentID, "", "", "accountability-intro")
		}
	}
	return sent, nil
}

// WelcomeSMS notifies the student's own + parent + teacher numbers.
func (s *Service) WelcomeSMS(ctx context.Context, studentID string) (int, error) {
	if s.cfg.TermiiKey == "" {
		return 0, errNotConfigured
	}
	var name, phone, parent, teacher string
	if err := s.pool.QueryRow(ctx, `SELECT name, phone, parent_phone, teacher_phone FROM students WHERE id=$1`,
		studentID).Scan(&name, &phone, &parent, &teacher); err != nil {
		return 0, errNotFound
	}
	if name == "" {
		name = "Student"
	}
	text := "Welcome to 274Lab, " + name + "! Your JAMB prep journey starts now. Complete your profile to receive weekly SMS progress reports. Log in at 274lab.app. - 274Lab"
	sent := 0
	for _, to := range []string{sms.Normalize(phone), sms.Normalize(parent), sms.Normalize(teacher)} {
		if to == "" {
			continue
		}
		r := s.sms.Send(ctx, to, text)
		if r.OK {
			sent++
		} else {
			s.recordSmsFailure(ctx, to, text, r.Error, studentID, "", "", "student-welcome")
		}
	}
	if sent == 0 {
		return 0, errBadInput
	}
	return sent, nil
}

func newID() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	const hexd = "0123456789abcdef"
	out := make([]byte, 24)
	for i, v := range b {
		out[i*2] = hexd[v>>4]
		out[i*2+1] = hexd[v&0x0f]
	}
	return string(out)
}
