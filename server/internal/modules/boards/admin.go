package boards

import (
	"context"
	"encoding/json"
	"sort"
	"time"
)

type YearStats struct {
	Year            string           `json:"year"`
	StudentCount    int              `json:"studentCount"`
	AttemptCount    int              `json:"attemptCount"`
	AvgScore        int              `json:"avgScore"`
	TopOverall      []map[string]any `json:"topOverall"`
	TopBySubject    []map[string]any `json:"topBySubject"`
	SubjectAverages []map[string]any `json:"subjectAverages"`
	Revenue         map[string]int   `json:"revenue"`
	StatusCounts    map[string]int   `json:"statusCounts"`
}

type scoreRow struct {
	studentID string
	subject   string
	score     int
	outOf     int
}

type paymentRow struct {
	studentID string
	amount    int
	paidAt    time.Time
}

type studentRow struct {
	id         string
	name       string
	year       string
	subUntil   *time.Time
	freeUsed   int
	trialStart *time.Time
	joined     *time.Time
}

// AdminStats computes (and caches) per-year aggregates.
func (s *Service) AdminStats(ctx context.Context, year string) (any, error) {
	all, err := s.loadAll(ctx)
	if err != nil {
		return nil, err
	}
	stats := s.computeGroup(all, year)
	raw, _ := json.Marshal(stats)
	docID := "overview"
	if year != "" {
		docID = "year_" + year
	}
	s.pool.Exec(ctx, `INSERT INTO admin_stats (id, data, updated_at)
		VALUES ($1,$2,now()) ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=now()`, docID, raw)
	return stats, nil
}

type dataset struct {
	students []studentRow
	scores   []scoreRow
	payments []paymentRow
}

func (s *Service) loadAll(ctx context.Context) (dataset, error) {
	var d dataset
	rows, err := s.pool.Query(ctx, `SELECT id, name, year, subscription_until,
		free_attempts_used, trial_started_at, joined_at FROM students`)
	if err != nil {
		return d, err
	}
	for rows.Next() {
		var st studentRow
		if err := rows.Scan(&st.id, &st.name, &st.year, &st.subUntil, &st.freeUsed, &st.trialStart, &st.joined); err == nil {
			d.students = append(d.students, st)
		}
	}
	rows.Close()
	srows, err := s.pool.Query(ctx, `SELECT student_id, subject, score, out_of FROM scores`)
	if err != nil {
		return d, err
	}
	for srows.Next() {
		var sc scoreRow
		if err := srows.Scan(&sc.studentID, &sc.subject, &sc.score, &sc.outOf); err == nil {
			d.scores = append(d.scores, sc)
		}
	}
	srows.Close()
	prows, err := s.pool.Query(ctx, `SELECT student_id, amount, paid_at FROM payments`)
	if err != nil {
		return d, err
	}
	for prows.Next() {
		var p paymentRow
		if err := prows.Scan(&p.studentID, &p.amount, &p.paidAt); err == nil {
			d.payments = append(d.payments, p)
		}
	}
	prows.Close()
	return d, nil
}

func (s *Service) computeGroup(d dataset, year string) YearStats {
	now := time.Now().UTC()
	inYear := func(yr string) bool { return year == "" || yr == year }
	students := []studentRow{}
	byID := map[string]studentRow{}
	for _, st := range d.students {
		if !inYear(st.year) {
			continue
		}
		students = append(students, st)
		byID[st.id] = st
	}
	ids := map[string]bool{}
	for _, st := range students {
		ids[st.id] = true
	}
	scores := []scoreRow{}
	for _, sc := range d.scores {
		if ids[sc.studentID] {
			scores = append(scores, sc)
		}
	}
	payments := []paymentRow{}
	for _, p := range d.payments {
		if year == "" || ids[p.studentID] {
			payments = append(payments, p)
		}
	}

	avg := 0
	if len(scores) > 0 {
		sum := 0
		for _, sc := range scores {
			sum += sc.score
		}
		avg = sum / len(scores)
	}

	// Best-4 totals per student.
	best := map[string]map[string]scoreRow{}
	for _, sc := range scores {
		if best[sc.studentID] == nil {
			best[sc.studentID] = map[string]scoreRow{}
		}
		if cur, ok := best[sc.studentID][sc.subject]; !ok || sc.score > cur.score {
			best[sc.studentID][sc.subject] = sc
		}
	}
	type total struct {
		id, name string
		sum      int
	}
	totals := []total{}
	for sid, m := range best {
		if len(m) < 4 {
			continue
		}
		list := []scoreRow{}
		for _, sc := range m {
			list = append(list, sc)
		}
		sort.Slice(list, func(i, j int) bool { return list[i].score > list[j].score })
		sum := 0
		for i := 0; i < 4 && i < len(list); i++ {
			sum += list[i].score
		}
		name := "Unknown"
		if st, ok := byID[sid]; ok {
			name = st.name
		}
		totals = append(totals, total{sid, name, sum})
	}
	sort.Slice(totals, func(i, j int) bool { return totals[i].sum > totals[j].sum })
	topOverall := []map[string]any{}
	for i, t := range totals {
		if i >= 10 {
			break
		}
		topOverall = append(topOverall, map[string]any{"name": t.name, "total": t.sum})
	}

	topBySubject := []map[string]any{}
	subjectAverages := []map[string]any{}
	for _, subject := range subjects {
		sub := []scoreRow{}
		for _, sc := range scores {
			if sc.subject == subject {
				sub = append(sub, sc)
			}
		}
		if len(sub) == 0 {
			continue
		}
		perStudent := map[string]scoreRow{}
		for _, sc := range sub {
			if cur, ok := perStudent[sc.studentID]; !ok || sc.score > cur.score {
				perStudent[sc.studentID] = sc
			}
		}
		list := []scoreRow{}
		for _, sc := range perStudent {
			list = append(list, sc)
		}
		sort.Slice(list, func(i, j int) bool { return list[i].score > list[j].score })
		ranked := []map[string]any{}
		for i, sc := range list {
			if i >= 3 {
				break
			}
			name := "Unknown"
			if st, ok := byID[sc.studentID]; ok && st.name != "" {
				name = st.name
			}
			outOf := sc.outOf
			if outOf == 0 {
				outOf = 100
			}
			ranked = append(ranked, map[string]any{"name": name, "score": sc.score,
				"outOf": outOf, "pct": sc.score * 100 / outOf})
		}
		topBySubject = append(topBySubject, map[string]any{"subject": subject, "ranked": ranked})
		sum := 0
		for _, sc := range sub {
			sum += sc.score
		}
		outOf := sub[0].outOf
		if outOf == 0 {
			outOf = 160
		}
		subjectAverages = append(subjectAverages, map[string]any{"subject": subject,
			"avg": sum / len(sub), "outOf": outOf, "attemptCount": len(sub)})
	}

	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	last30 := now.Add(-30 * 24 * time.Hour)
	rev := map[string]int{"total": 0, "thisMonth": 0, "last30Days": 0}
	for _, p := range payments {
		rev["total"] += p.amount
		if !p.paidAt.Before(monthStart) {
			rev["thisMonth"] += p.amount
		}
		if !p.paidAt.Before(last30) {
			rev["last30Days"] += p.amount
		}
	}

	status := map[string]int{"active": 0, "freebie": 0, "expired": 0}
	for _, st := range students {
		s := statusOf(st, now)
		status[s]++
	}

	return YearStats{Year: year, StudentCount: len(students), AttemptCount: len(scores),
		AvgScore: avg, TopOverall: topOverall, TopBySubject: topBySubject,
		SubjectAverages: subjectAverages, Revenue: rev, StatusCounts: status}
}

// statusOf mirrors the Node getStatus used for stats (no suspended check).
func statusOf(st studentRow, now time.Time) string {
	if st.subUntil != nil && st.subUntil.After(now) {
		return "active"
	}
	if st.freeUsed == 0 {
		return "freebie"
	}
	start := st.trialStart
	if start == nil {
		start = st.joined
	}
	trialOK := true
	if start != nil {
		trialOK = now.Sub(*start) < 14*24*time.Hour
	}
	if st.freeUsed < 2 && trialOK {
		return "freebie"
	}
	return "expired"
}
