package boards

import (
	"context"
	"encoding/json"
	"sort"
)

type Growth struct {
	Referrals map[string]any `json:"referrals"`
	Squads    map[string]any `json:"squads"`
	Lifelines map[string]any `json:"lifelines"`
}

// GrowthStats answers: invite-code adoption, squad building, lifeline usage.
func (s *Service) GrowthStats(ctx context.Context) (Growth, error) {
	var out Growth
	type stu struct {
		id, name, referralNo, referredBy string
		squad                            []string
	}
	students := []stu{}
	byRefNo := map[string]*stu{}
	rows, err := s.pool.Query(ctx, `SELECT id, name, COALESCE(referral_no,''), COALESCE(referred_by,''), squad FROM students`)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var st stu
		if err := rows.Scan(&st.id, &st.name, &st.referralNo, &st.referredBy, &st.squad); err == nil {
			students = append(students, st)
			if st.referralNo != "" {
				cp := st
				byRefNo[st.referralNo] = &cp
			}
		}
	}
	rows.Close()
	byID := map[string]*stu{}
	for i := range students {
		byID[students[i].id] = &students[i]
	}

	referred := 0
	refCounts := map[string]int{}
	for _, st := range students {
		rb := st.referredBy
		if rb == "" {
			continue
		}
		referred++
		padded := rb
		if len(padded) < 2 {
			padded = "0" + padded
		}
		if r, ok := byRefNo[padded]; ok && r.id != st.id {
			refCounts[r.id]++
		} else if r, ok := byRefNo[rb]; ok && r.id != st.id {
			refCounts[r.id]++
		}
	}
	type top struct {
		ID, Name string
		Count    int
	}
	tops := []top{}
	for id, c := range refCounts {
		name := "Unknown"
		if st, ok := byID[id]; ok {
			name = st.name
		}
		tops = append(tops, top{id, name, c})
	}
	sort.Slice(tops, func(i, j int) bool { return tops[i].Count > tops[j].Count })
	if len(tops) > 10 {
		tops = tops[:10]
	}
	topReferrers := []map[string]any{}
	for _, t := range tops {
		topReferrers = append(topReferrers, map[string]any{"id": t.ID, "name": t.Name, "count": t.Count})
	}

	withSquad, links := 0, 0
	sizeDist := map[int]int{1: 0, 2: 0, 3: 0, 4: 0}
	for _, st := range students {
		n := 0
		for _, f := range st.squad {
			if f != "" {
				n++
			}
		}
		if n > 0 {
			withSquad++
			if n > 4 {
				n = 4
			}
			links += n
			sizeDist[n]++
		}
	}
	avgSize := 0.0
	if withSquad > 0 {
		avgSize = float64(links) / float64(withSquad)
		avgSize = float64(int(avgSize*10)) / 10
	}

	var payouts, coinsPaid int
	_ = s.pool.QueryRow(ctx, `SELECT count(*), COALESCE(sum(delta),0) FROM coin_ledger WHERE reason='referral'`).Scan(&payouts, &coinsPaid)

	uses := map[string]int{"ask": 0, "peek": 0, "fifty": 0}
	byUser := map[string]int{}
	byWeek := map[string]map[string]int{}
	scanned, withLife := 0, 0
	srows, err := s.pool.Query(ctx, `SELECT student_id, week, lifeline_usage FROM quiz_sessions ORDER BY started_at LIMIT 5000`)
	if err == nil {
		for srows.Next() {
			var sid, week string
			var usage map[string]int
			var raw []byte
			// lifeline_usage stored as JSONB; decode generically
			if err := srows.Scan(&sid, &week, &raw); err != nil {
				continue
			}
			scanned++
			usage = map[string]int{}
			if len(raw) > 0 {
				_ = json.Unmarshal(raw, &usage)
			}
			tot := usage["ask"] + usage["peek"] + usage["fifty"]
			if tot > 0 {
				withLife++
				uses["ask"] += usage["ask"]
				uses["peek"] += usage["peek"]
				uses["fifty"] += usage["fifty"]
				byUser[sid] += tot
				w := byWeek[week]
				if w == nil {
					w = map[string]int{"ask": 0, "peek": 0, "fifty": 0, "sessions": 0}
				}
				w["ask"] += usage["ask"]
				w["peek"] += usage["peek"]
				w["fifty"] += usage["fifty"]
				w["sessions"]++
				byWeek[week] = w
			}
		}
		srows.Close()
	}
	totalUses := uses["ask"] + uses["peek"] + uses["fifty"]
	topKind := ""
	if totalUses > 0 {
		best, bestN := "", -1
		for k, v := range uses {
			if v > bestN {
				best, bestN = k, v
			}
		}
		topKind = best
	}
	topUsers := []map[string]any{}
	type uc struct {
		id, name string
		count    int
	}
	ulist := []uc{}
	for id, c := range byUser {
		name := "Unknown"
		if st, ok := byID[id]; ok {
			name = st.name
		}
		ulist = append(ulist, uc{id, name, c})
	}
	sort.Slice(ulist, func(i, j int) bool { return ulist[i].count > ulist[j].count })
	for i, u := range ulist {
		if i >= 10 {
			break
		}
		topUsers = append(topUsers, map[string]any{"id": u.id, "name": u.name, "count": u.count})
	}

	total := len(students)
	refRate, squadRate := 0, 0
	if total > 0 {
		refRate = referred * 100 / total
		squadRate = withSquad * 100 / total
	}
	out.Referrals = map[string]any{"total": total, "referredCount": referred, "rate": refRate,
		"topReferrers": topReferrers, "payouts": payouts, "coinsPaid": coinsPaid}
	out.Squads = map[string]any{"total": total, "withSquad": withSquad, "rate": squadRate,
		"avgSize": avgSize, "sizeDist": sizeDist}
	out.Lifelines = map[string]any{"sessionsScanned": scanned, "sessionsWithLifeline": withLife,
		"totalUses": totalUses, "uses": uses, "lifelineUsers": len(byUser), "topKind": topKind,
		"topUsers": topUsers, "byWeek": byWeek}
	return out, nil
}
