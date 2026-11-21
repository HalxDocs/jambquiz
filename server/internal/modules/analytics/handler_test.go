package analytics

import (
	"testing"
	"time"
)

func TestRangeCutoff(t *testing.T) {
	if got := rangeCutoff(""); got != nil {
		t.Fatalf("empty range should have no cutoff, got %v", got)
	}
	if got := rangeCutoff("all"); got != nil {
		t.Fatalf("unknown range should have no cutoff, got %v", got)
	}

	cases := []struct {
		key  string
		want func(time.Time) time.Time
	}{
		{"7d", func(now time.Time) time.Time { return now.AddDate(0, 0, -7) }},
		{"14d", func(now time.Time) time.Time { return now.AddDate(0, 0, -14) }},
		{"1m", func(now time.Time) time.Time { return now.AddDate(0, -1, 0) }},
		{"1y", func(now time.Time) time.Time { return now.AddDate(-1, 0, 0) }},
	}
	for _, tc := range cases {
		t.Run(tc.key, func(t *testing.T) {
			got := rangeCutoff(tc.key)
			if got == nil {
				t.Fatal("expected a cutoff")
			}
			want := tc.want(time.Now())
			if diff := got.Sub(want); diff < -time.Minute || diff > time.Minute {
				t.Fatalf("cutoff %s is %v away from %s", tc.key, diff, want)
			}
		})
	}
}
