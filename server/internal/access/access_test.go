package access

import (
	"testing"
	"time"
)

func TestStatuses(t *testing.T) {
	now := time.Now()
	past := now.Add(-time.Hour)
	future := now.Add(30 * 24 * time.Hour)

	if got := For(Student{Suspended: true}, now); got.Status != "suspended" {
		t.Fatal("suspended")
	}
	if got := For(Student{SubscriptionUntil: &future}, now); got.Status != "active" {
		t.Fatal("active")
	}
	fresh := now.Add(-time.Hour)
	if got := For(Student{TrialStartedAt: &fresh}, now); got.Status != "freebie" || got.FreeAttemptsLeft != 2 {
		t.Fatalf("fresh freebie: %+v", got)
	}
	old := now.Add(-30 * 24 * time.Hour)
	if got := For(Student{FreeAttemptsUsed: 2, TrialStartedAt: &old}, now); got.Status != "expired" {
		t.Fatal("expired")
	}
	// Zero-test student with ancient join is still freebie (trial starts on first test).
	if got := For(Student{JoinedAt: &old}, now); got.Status != "freebie" {
		t.Fatal("zero-test freebie")
	}
	_ = past
}
