package notify

import (
	"testing"
	"time"
)

func TestNextWeekendQuizTimes(t *testing.T) {
	cases := []struct {
		name       string
		lastQuiz   time.Time
		weeksAhead int
		wantSat    time.Time
		wantSun    time.Time
	}{
		{
			name:       "last slot Sunday",
			lastQuiz:   time.Date(2026, 11, 22, 16, 0, 0, 0, time.UTC),
			weeksAhead: 1,
			wantSat:    time.Date(2026, 11, 28, 16, 0, 0, 0, time.UTC),
			wantSun:    time.Date(2026, 11, 29, 16, 0, 0, 0, time.UTC),
		},
		{
			name:       "old Friday schedule",
			lastQuiz:   time.Date(2026, 11, 20, 16, 0, 0, 0, time.UTC),
			weeksAhead: 1,
			wantSat:    time.Date(2026, 11, 28, 16, 0, 0, 0, time.UTC),
			wantSun:    time.Date(2026, 11, 29, 16, 0, 0, 0, time.UTC),
		},
		{
			name:       "stale week fast-forward",
			lastQuiz:   time.Date(2026, 11, 22, 16, 0, 0, 0, time.UTC),
			weeksAhead: 2,
			wantSat:    time.Date(2026, 12, 5, 16, 0, 0, 0, time.UTC),
			wantSun:    time.Date(2026, 12, 6, 16, 0, 0, 0, time.UTC),
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sat, sun := nextWeekendQuizTimes(tc.lastQuiz, tc.weeksAhead)
			if !sat.Equal(tc.wantSat) || !sun.Equal(tc.wantSun) {
				t.Fatalf("got %s and %s, want %s and %s",
					sat.UTC(), sun.UTC(), tc.wantSat, tc.wantSun)
			}
		})
	}
}
