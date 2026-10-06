package notify

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/274lab/server/internal/access"
	"github.com/274lab/server/pkg/push"
	"github.com/274lab/server/pkg/sms"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Config struct {
	VapidPublic  string
	VapidPrivate string
	VapidSubject string
	TermiiKey    string
	TermiiSender string
}

type Service struct {
	pool   *pgxpool.Pool
	cfg    Config
	sms    *sms.Client
	sender *push.Sender
	http   *http.Client
}

func NewService(pool *pgxpool.Pool, cfg Config) *Service {
	return &Service{
		pool:   pool,
		cfg:    cfg,
		sms:    sms.New(cfg.TermiiKey, cfg.TermiiSender),
		sender: &push.Sender{PublicKey: cfg.VapidPublic, PrivateKey: cfg.VapidPrivate, Subject: cfg.VapidSubject},
		http:   &http.Client{Timeout: 20 * time.Second},
	}
}

var weekSanitize = regexp.MustCompile(`[^a-zA-Z0-9_-]`)

func sanitizeWeek(week string) string {
	s := weekSanitize.ReplaceAllString(week, "_")
	if len(s) > 50 {
		s = s[:50]
	}
	return s
}

func (s *Service) activeWeek(ctx context.Context) string {
	var data []byte
	if err := s.pool.QueryRow(ctx, `SELECT data FROM settings WHERE key='activeWeek'`).Scan(&data); err != nil {
		return "Week 1"
	}
	var d struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.Value == "" {
		return "Week 1"
	}
	return d.Value
}

type quizDates struct {
	Date1 string `json:"date1"`
	Date2 string `json:"date2"`
}

func (s *Service) getQuizDates(ctx context.Context, week string) quizDates {
	var data []byte
	if err := s.pool.QueryRow(ctx, `SELECT data FROM settings WHERE key=$1`, "quizDates_"+sanitizeWeek(week)).Scan(&data); err != nil {
		return quizDates{}
	}
	var qd quizDates
	_ = json.Unmarshal(data, &qd)
	return qd
}

func quizTimes(qd quizDates) []time.Time {
	out := []time.Time{}
	for _, d := range []string{qd.Date1, qd.Date2} {
		if d == "" {
			continue
		}
		if t, err := time.Parse(time.RFC3339, d); err == nil {
			out = append(out, t)
		}
	}
	return out
}

// eligibleSubscriber mirrors the Node pass: paid, or trial with attempts left.
func (s *Service) eligibleSubscriber(ctx context.Context, studentID string, now time.Time) bool {
	var suspended bool
	var subUntil, trialStart, joined *time.Time
	var freeUsed int
	if err := s.pool.QueryRow(ctx, `SELECT suspended, subscription_until, free_attempts_used,
		trial_started_at, joined_at FROM students WHERE id=$1`, studentID,
	).Scan(&suspended, &subUntil, &freeUsed, &trialStart, &joined); err != nil {
		return false
	}
	st := access.For(access.Student{Suspended: suspended, SubscriptionUntil: subUntil,
		FreeAttemptsUsed: freeUsed, TrialStartedAt: trialStart, JoinedAt: joined}, now)
	return st.Status == "active" || st.Status == "freebie"
}

type subscription struct {
	studentID string
	endpoint  string
	p256dh    string
	auth      string
}

func (s *Service) allSubs(ctx context.Context) []subscription {
	rows, err := s.pool.Query(ctx, `SELECT student_id, endpoint, keys->>'p256dh', keys->>'auth' FROM push_subscriptions`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []subscription{}
	for rows.Next() {
		var sub subscription
		if err := rows.Scan(&sub.studentID, &sub.endpoint, &sub.p256dh, &sub.auth); err == nil {
			out = append(out, sub)
		}
	}
	return out
}

// --- SMS body (weekly report) ---

var subjectAbbr = map[string]string{
	"Mathematics": "MTH", "Physics": "PHY", "Chemistry": "CHM", "Biology": "BIO",
	"English Language": "ENG", "Government": "GOV", "Literature in English": "LIT",
	"Christian Religious Studies": "CRS", "Islamic Religious Studies": "IRS",
	"Commerce": "COM", "Economics": "ECO",
}

func truncateTopic(name string, maxLen int) string {
	if len(name) > maxLen {
		return name[:maxLen]
	}
	return name
}

type topicNames map[string]struct {
	Name    string
	SMSName string
}

func (s *Service) getTopicNames(ctx context.Context, week string) topicNames {
	out := topicNames{}
	var data []byte
	if err := s.pool.QueryRow(ctx, `SELECT topics FROM topics WHERE week=$1`, week).Scan(&data); err != nil {
		return out
	}
	var topics map[string]json.RawMessage
	if err := json.Unmarshal(data, &topics); err != nil {
		return out
	}
	for subject, raw := range topics {
		var t struct {
			Name    string `json:"name"`
			SMSName string `json:"smsName"`
		}
		if err := json.Unmarshal(raw, &t); err == nil && t.Name != "" {
			out[subject] = struct {
				Name    string
				SMSName string
			}{t.Name, t.SMSName}
			continue
		}
		var plain string
		if err := json.Unmarshal(raw, &plain); err == nil && plain != "" {
			out[subject] = struct {
				Name    string
				SMSName string
			}{plain, ""}
		}
	}
	return out
}

func buildSmsBody(name, week string, scores []struct {
	Subject string
	Score   *int
}, names topicNames) string {
	lines := []string{"Hi,", "Here's a weekly report for " + name + " from 274Lab.", "", "PERFORMANCE:"}
	for _, sc := range scores {
		abbr, ok := subjectAbbr[sc.Subject]
		if !ok {
			abbr = strings.ToUpper(sc.Subject)
			if len(abbr) > 3 {
				abbr = abbr[:3]
			}
		}
		topic := names[sc.Subject]
		label := topic.SMSName
		if label == "" {
			label = truncateTopic(topic.Name, 14)
		}
		part := "ABS"
		if sc.Score != nil {
			part = itoa(*sc.Score) + "%"
		}
		if label != "" {
			lines = append(lines, abbr+": ("+label+") - "+part)
		} else {
			lines = append(lines, abbr+" - "+part)
		}
	}
	lines = append(lines, "", "Powered by 274lab")
	return strings.Join(lines, "\n")
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	out := []byte{}
	for n > 0 {
		out = append([]byte{byte('0' + n%10)}, out...)
		n /= 10
	}
	return string(out)
}

func (s *Service) recordSmsFailure(ctx context.Context, to, text, errStr, studentID, week, label, source string) {
	text = strings.Clone(text)
	if len(text) > 200 {
		text = text[:200]
	}
	if len(errStr) > 500 {
		errStr = errStr[:500]
	}
	s.pool.Exec(ctx, `INSERT INTO sms_failures (recipient, sms, error, sender_id, student_id, week, label, source)
		VALUES ($1,$2,$3,$4,NULLIF($5,''),NULLIF($6,''),$7,$8)`,
		to, text, errStr, s.cfg.TermiiSender, studentID, week, label, source)
}
