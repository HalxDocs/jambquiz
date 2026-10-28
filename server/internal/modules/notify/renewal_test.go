package notify

import (
	"testing"
	"time"
)

func TestRenewalDueFirstNudge(t *testing.T) {
	now := time.Date(2026, 10, 28, 9, 0, 0, 0, time.UTC)
	if !renewalDue(now, nil, nil, 0) {
		t.Fatal("a lapsed student with no campaign yet should be nudged")
	}
}

func TestRenewalDueRespectsInterval(t *testing.T) {
	now := time.Date(2026, 10, 28, 9, 0, 0, 0, time.UTC)
	first := now.Add(-2 * renewalInterval)
	last := now.Add(-47 * time.Hour)
	if renewalDue(now, &first, &last, 1) {
		t.Fatal("47h after the last nudge is too soon")
	}
	last = now.Add(-renewalInterval)
	if !renewalDue(now, &first, &last, 2) {
		t.Fatal("exactly one interval after the last nudge is due")
	}
}

func TestRenewalDueStopsAtMaxNudges(t *testing.T) {
	now := time.Date(2026, 10, 28, 9, 0, 0, 0, time.UTC)
	first := now.Add(-24 * time.Hour)
	last := now.Add(-renewalInterval)
	if renewalDue(now, &first, &last, renewalMaxNudges) {
		t.Fatal("the campaign must stop once the cap is reached")
	}
}

func TestRenewalDueStopsAfterCampaign(t *testing.T) {
	now := time.Date(2026, 10, 28, 9, 0, 0, 0, time.UTC)
	first := now.Add(-renewalCampaign)
	last := now.Add(-renewalInterval)
	if renewalDue(now, &first, &last, 2) {
		t.Fatal("no nudges after the campaign window has elapsed")
	}
	// One second inside the window is still allowed.
	first = now.Add(-renewalCampaign + time.Second)
	if !renewalDue(now, &first, &last, 2) {
		t.Fatal("a campaign just inside the window should still nudge")
	}
}

func TestRenewalWindowOpen(t *testing.T) {
	cases := []struct {
		hourUTC int
		want    bool
	}{
		{6, false},  // 07:00 WAT, too early
		{7, true},   // 08:00 WAT
		{12, true},  // midday
		{19, true},  // 20:00 WAT
		{20, false}, // 21:00 WAT, too late
		{0, false},  // midnight
	}
	for _, tc := range cases {
		now := time.Date(2026, 10, 28, tc.hourUTC, 0, 0, 0, time.UTC)
		if got := renewalWindowOpen(now); got != tc.want {
			t.Errorf("%02d:00 UTC: got %v want %v", tc.hourUTC, got, tc.want)
		}
	}
}
