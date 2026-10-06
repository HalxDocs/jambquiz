package access

import "time"

const (
	freeAttempts = 2
	trialDays    = 14
)

// Status mirrors the web client's getAccessStatus.
type Status struct {
	Status           string `json:"status"` // active | freebie | expired | suspended
	FreeAttemptsLeft int    `json:"freeAttemptsLeft"`
	TrialDaysLeft    int    `json:"trialDaysLeft"`
}

type Student struct {
	Suspended         bool
	SubscriptionUntil *time.Time
	FreeAttemptsUsed  int
	TrialStartedAt    *time.Time
	JoinedAt          *time.Time
}

func trialActive(st Student, now time.Time) bool {
	start := st.TrialStartedAt
	if start == nil {
		start = st.JoinedAt
	}
	if start == nil {
		return true
	}
	return now.Sub(*start) < trialDays*24*time.Hour
}

func trialLeft(st Student, now time.Time) int {
	start := st.TrialStartedAt
	if start == nil {
		start = st.JoinedAt
	}
	if start == nil {
		return trialDays
	}
	left := start.Add(trialDays * 24 * time.Hour).Sub(now)
	if left <= 0 {
		return 0
	}
	d := int(left.Hours() / 24)
	if left.Hours()-float64(d*24) > 0 {
		d++
	}
	return d
}

// For returns the access status. A student with zero used attempts is always
// freebie: the trial starts on the first test, not on registration.
func For(st Student, now time.Time) Status {
	if st.Suspended {
		return Status{Status: "suspended"}
	}
	left := freeAttempts - st.FreeAttemptsUsed
	if left < 0 {
		left = 0
	}
	if st.FreeAttemptsUsed == 0 && (st.SubscriptionUntil == nil || !st.SubscriptionUntil.After(now)) {
		return Status{Status: "freebie", FreeAttemptsLeft: left, TrialDaysLeft: trialDays}
	}
	if st.SubscriptionUntil != nil && st.SubscriptionUntil.After(now) {
		return Status{Status: "active", FreeAttemptsLeft: left, TrialDaysLeft: trialLeft(st, now)}
	}
	if st.FreeAttemptsUsed < freeAttempts && trialActive(st, now) {
		return Status{Status: "freebie", FreeAttemptsLeft: left, TrialDaysLeft: trialLeft(st, now)}
	}
	return Status{Status: "expired"}
}
