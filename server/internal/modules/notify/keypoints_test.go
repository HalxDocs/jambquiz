package notify

import "testing"

func testPoints() []keyPoint {
	return []keyPoint{
		{ID: "a", Subject: "Physics", Point: "A"},
		{ID: "b", Subject: "Chemistry", Point: "B"},
		{ID: "c", Subject: "Biology", Point: "C"},
	}
}

func TestSelectNextPointFirstOneForNewStudent(t *testing.T) {
	got := selectNextPoint(testPoints(), map[string]int{}, 0)
	if got == nil || got.ID != "a" {
		t.Fatalf("new student should get the first point, got %+v", got)
	}
}

func TestSelectNextPointAdvancesWithCycle(t *testing.T) {
	for cycle, want := range []string{"a", "b", "c"} {
		got := selectNextPoint(testPoints(), map[string]int{}, cycle)
		if got == nil || got.ID != want {
			t.Fatalf("cycle %d: want %q, got %+v", cycle, want, got)
		}
	}
}

func TestSelectNextPointWrapsAround(t *testing.T) {
	got := selectNextPoint(testPoints(), map[string]int{}, 3)
	if got == nil || got.ID != "a" {
		t.Fatalf("cycle should wrap to the first point, got %+v", got)
	}
}

func TestSelectNextPointSkipsRetiredPoints(t *testing.T) {
	seen := map[string]int{"a": maxTimesPerPoint}
	// "a" is retired, so the available list is [b, c] and cycle 1 picks c.
	got := selectNextPoint(testPoints(), seen, 1)
	if got == nil || got.ID != "c" {
		t.Fatalf("retired point was not skipped, got %+v", got)
	}
}

func TestSelectNextPointReturnsNilWhenEverythingIsRetired(t *testing.T) {
	seen := map[string]int{"a": maxTimesPerPoint, "b": 5, "c": maxTimesPerPoint}
	if got := selectNextPoint(testPoints(), seen, 0); got != nil {
		t.Fatalf("expected nil so the caller resets the cycle, got %+v", got)
	}
}

func TestSelectNextPointNilForNoPoints(t *testing.T) {
	if got := selectNextPoint(nil, map[string]int{}, 0); got != nil {
		t.Fatalf("expected nil for an empty point list, got %+v", got)
	}
}
