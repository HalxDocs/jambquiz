package quiz

import (
	"reflect"
	"testing"
)

func TestGrade(t *testing.T) {
	g := GradeSubject([]int{0, 1, 2, 3}, []int{0, 2, -1, 3})
	if g.Correct != 2 || g.Wrong != 1 || g.Unanswered != 1 || g.Total != 4 || g.Score != 50 {
		t.Fatalf("%+v", g)
	}
	if GradeSubject([]int{}, []int{}).Score != 0 {
		t.Fatal("empty")
	}
}

func TestPickDeterministic(t *testing.T) {
	ids := []string{"a", "b", "c", "d", "e", "f", "g"}
	a := PickQuestions(ids, 4, "uid|Week 1|Mathematics")
	b := PickQuestions(ids, 4, "uid|Week 1|Mathematics")
	c := PickQuestions(ids, 4, "uid|Week 1|Physics")
	if !reflect.DeepEqual(a, b) {
		t.Fatal("same seed diverged")
	}
	if reflect.DeepEqual(a, c) {
		t.Fatal("different seeds converged suspiciously")
	}
	if len(a) != 4 {
		t.Fatal("count")
	}
}

func TestStandardQuizWindowUsesSaturdayAndSunday(t *testing.T) {
	cases := []struct {
		name string
		date string
		want bool
	}{
		{"Saturday at 5pm WAT", "2026-11-21T16:00:00Z", true},
		{"Sunday at 5pm WAT", "2026-11-22T16:00:00Z", true},
		{"Friday at 5pm WAT", "2026-11-20T16:00:00Z", false},
		{"Saturday before window", "2026-11-21T15:00:00Z", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isStandardWindowDate(tc.date); got != tc.want {
				t.Fatalf("isStandardWindowDate(%q) = %v, want %v", tc.date, got, tc.want)
			}
		})
	}
}
