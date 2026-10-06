package quiz

// Grading is a simple percentage: correct/total*100 rounded. The real
// UTME/JAMB does not deduct for wrong answers, and neither do we
// (DESCRIPTION.md's +4/-1/0 note does not match the shipped engine).

type Grade struct {
	Correct    int   `json:"correct"`
	Wrong      int   `json:"wrong"`
	Unanswered int   `json:"unanswered"`
	Total      int   `json:"total"`
	Score      int   `json:"score"`
	AnswerKey  []int `json:"answerKey"`
}

func GradeSubject(key, submitted []int) Grade {
	g := Grade{Total: len(key), AnswerKey: append([]int{}, key...)}
	for i, ans := range key {
		var chosen = -1
		if i < len(submitted) {
			chosen = submitted[i]
		}
		switch {
		case chosen == -1:
			g.Unanswered++
		case chosen == ans:
			g.Correct++
		default:
			g.Wrong++
		}
	}
	if g.Total > 0 {
		g.Score = (g.Correct*100 + g.Total/2) / g.Total
	}
	return g
}

// hashString is FNV-1a over char codes (ASCII seeds: uid|week|subject).
func hashString(s string) uint32 {
	h := uint32(2166136261)
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return h
}

// PickQuestions is the seeded Fisher-Yates from the Node engine: identical
// seeds produce identical sets across both backends during migration.
func PickQuestions(ids []string, count int, seed string) []string {
	a := append([]string{}, ids...)
	s := hashString(seed)
	if s == 0 {
		s = 1
	}
	for i := len(a) - 1; i > 0; i-- {
		s = s*1664525 + 1013904223
		j := int(s % uint32(i+1))
		a[i], a[j] = a[j], a[i]
	}
	if count > len(a) {
		count = len(a)
	}
	return a[:count]
}
