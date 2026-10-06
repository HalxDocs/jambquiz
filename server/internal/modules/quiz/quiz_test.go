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
