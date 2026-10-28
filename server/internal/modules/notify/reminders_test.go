package notify

import (
	"testing"
	"time"
)

func TestReminderDueOnTime(t *testing.T) {
	const twoHours = 2 * 60 * 60 * 1000
	if !reminderDue(twoHours, twoHours) {
		t.Fatal("the 2h reminder should fire when exactly 2h remain")
	}
}

func TestReminderDueAllowsShortDelay(t *testing.T) {
	const fiveMinutes = 5 * 60 * 1000
	// Two minutes after the target moment: still worth sending.
	if !reminderDue(fiveMinutes-2*60*1000, fiveMinutes) {
		t.Fatal("a reminder 2 minutes late should still fire")
	}
}

func TestReminderDueRejectsStaleReminder(t *testing.T) {
	const fiveMinutes = 5 * 60 * 1000
	// Well past the grace period: the quiz is about to start, so skip.
	if reminderDue(fiveMinutes-10*60*1000, fiveMinutes) {
		t.Fatal("a reminder 10 minutes late must not fire")
	}
}

func TestReminderDueRejectsAfterQuizStart(t *testing.T) {
	const fiveMinutes = 5 * 60 * 1000
	if reminderDue(-time.Minute.Milliseconds(), fiveMinutes) {
		t.Fatal("no reminder once the quiz has started")
	}
}

func TestReminderDueRejectsTooEarly(t *testing.T) {
	const fiveMinutes = 5 * 60 * 1000
	// More than a minute early: wait for the next poll.
	if reminderDue(fiveMinutes+5*60*1000, fiveMinutes) {
		t.Fatal("a reminder more than a minute early must not fire")
	}
}

func TestQuizTimeDue(t *testing.T) {
	start := time.Date(2026, 10, 30, 16, 0, 0, 0, time.UTC)
	cases := []struct {
		name string
		now  time.Time
		want bool
	}{
		{"before start", start.Add(-time.Minute), false},
		{"at start", start, true},
		{"five minutes late (old window)", start.Add(5 * time.Minute), true},
		{"after a restart", start.Add(20 * time.Minute), true},
		{"beyond catch-up window", start.Add(quizTimeWindow + time.Minute), false},
	}
	for _, tc := range cases {
		if got := quizTimeDue(tc.now, start); got != tc.want {
			t.Errorf("%s: got %v want %v", tc.name, got, tc.want)
		}
	}
}
