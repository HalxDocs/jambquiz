package boards

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

var subjects = []string{
	"Mathematics", "Physics", "Chemistry", "Biology",
	"English Language", "Government", "Literature in English",
	"Christian Religious Studies", "Islamic Religious Studies",
	"Commerce", "Economics",
}

// ComputeLeaderboard rebuilds the cached boards from incremental rank rows.
func (s *Service) ComputeLeaderboard(ctx context.Context) error {
	rows, err := s.pool.Query(ctx, `SELECT student_id, name, nickname, year, subjects,
		best_by_subject, total, session_count, gold_medals FROM leaderboard_student_ranks
		WHERE qualified ORDER BY total DESC LIMIT 1000`)
	if err != nil {
		return err
	}
	type rank struct {
		id       string
		name     string
		nickname string
		year     string
		subjects []string
		best     map[string]struct{ Score, OutOf int }
		total    int
		sessions int
		medals   int
	}
	ranked := []rank{}
	for rows.Next() {
		var r rank
		var bestJSON []byte
		if err := rows.Scan(&r.id, &r.name, &r.nickname, &r.year, &r.subjects, &bestJSON,
			&r.total, &r.sessions, &r.medals); err == nil {
			r.best = map[string]struct{ Score, OutOf int }{}
			_ = json.Unmarshal(bestJSON, &r.best)
			ranked = append(ranked, r)
		}
	}
	rows.Close()

	overall := []map[string]any{}
	for i, r := range ranked {
		if i >= 100 {
			break
		}
		overall = append(overall, map[string]any{"id": r.id, "name": r.name, "nickname": r.nickname,
			"year": r.year, "subjects": r.subjects, "total": r.total,
			"sessionCount": r.sessions, "goldMedals": r.medals})
	}
	if err := s.setBoard(ctx, "overall", overall); err != nil {
		return err
	}

	for _, subject := range subjects {
		top := []map[string]any{}
		type entry struct {
			id, name, nickname string
			score, outOf       int
		}
		list := []entry{}
		for _, r := range ranked {
			if b, ok := r.best[subject]; ok {
				list = append(list, entry{r.id, r.name, r.nickname, b.Score, b.OutOf})
			}
		}
		sort.Slice(list, func(i, j int) bool { return list[i].score > list[j].score })
		for i, e := range list {
			if i >= 10 {
				break
			}
			outOf := e.outOf
			if outOf == 0 {
				outOf = 100
			}
			top = append(top, map[string]any{"id": e.id, "name": e.name, "nickname": e.nickname,
				"score": e.score, "outOf": outOf})
		}
		key := "subject_" + strings.ReplaceAll(subject, " ", "_")
		if err := s.setBoard(ctx, key, top); err != nil {
			return err
		}
	}

	weeks := []string{}
	wrows, err := s.pool.Query(ctx, `SELECT DISTINCT week FROM leaderboard_week_ranks`)
	if err == nil {
		for wrows.Next() {
			var w string
			if err := wrows.Scan(&w); err == nil {
				weeks = append(weeks, w)
			}
		}
		wrows.Close()
	}
	for _, week := range weeks {
		wr, err := s.pool.Query(ctx, `SELECT student_id, name, nickname, total, session_count
			FROM leaderboard_week_ranks WHERE week=$1 ORDER BY total DESC LIMIT 100`, week)
		if err != nil {
			continue
		}
		top := []map[string]any{}
		for wr.Next() {
			var id, name, nick string
			var total, sess int
			if err := wr.Scan(&id, &name, &nick, &total, &sess); err == nil {
				top = append(top, map[string]any{"id": id, "name": name, "nickname": nick,
					"total": total, "sessionCount": sess, "goldMedals": 0})
			}
		}
		wr.Close()
		if err := s.setBoard(ctx, "week_"+strings.ReplaceAll(week, " ", "_"), top); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) setBoard(ctx context.Context, id string, top []map[string]any) error {
	if top == nil {
		top = []map[string]any{}
	}
	raw, _ := json.Marshal(top)
	_, err := s.pool.Exec(ctx, `INSERT INTO leaderboard_cache (id, top, updated_at)
		VALUES ($1,$2,now()) ON CONFLICT (id) DO UPDATE SET top=$2, updated_at=now()`, id, raw)
	return err
}

func (s *Service) board(ctx context.Context, id string) []map[string]any {
	var raw []byte
	if err := s.pool.QueryRow(ctx, `SELECT top FROM leaderboard_cache WHERE id=$1`, id).Scan(&raw); err != nil {
		return []map[string]any{}
	}
	var top []map[string]any
	_ = json.Unmarshal(raw, &top)
	if top == nil {
		return []map[string]any{}
	}
	return top
}

// Board serves a cached board (overall / subject_X / week_X).
func (s *Service) Board(ctx context.Context, id string) []map[string]any {
	return s.board(ctx, id)
}

// RefreshPublicStats recomputes the marketing counters.
func (s *Service) RefreshPublicStats(ctx context.Context) error {
	var students, quizzes, weekCount int
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM students`).Scan(&students)
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM scores`).Scan(&quizzes)
	week := s.activeWeek(ctx)
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM scores WHERE week=$1`, week).Scan(&weekCount)

	var avgPct float64
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE((data->>'averageScorePct')::float,0) FROM admin_settings WHERE id='stats_counters'`).Scan(&avgPct)
	var activeSubs int
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE((data->>'activeSubscriptions')::int,0) FROM admin_settings WHERE id='stats_counters'`).Scan(&activeSubs)

	var topScore int
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(max(total),0) FROM leaderboard_student_ranks`).Scan(&topScore)
	var topPct, topLastWeek int
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(max(score),0) FROM scores`).Scan(&topPct)
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(max(score),0) FROM scores WHERE week=$1`, week).Scan(&topLastWeek)
	if topLastWeek == 0 {
		_ = s.pool.QueryRow(ctx, `SELECT COALESCE(max(total),0) FROM leaderboard_week_ranks WHERE week=$1`, week).Scan(&topLastWeek)
	}
	var topWeekly int
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(max(total),0) FROM leaderboard_week_ranks`).Scan(&topWeekly)

	data, _ := json.Marshal(map[string]any{
		"totalStudents": students, "activeSubscriptions": activeSubs,
		"totalQuizzesTaken": quizzes, "studentsActiveThisWeek": weekCount,
		"averageScorePct": avgPct, "topScore": topScore, "topScorePct": topPct,
		"topScoreLastWeek": topLastWeek, "topWeeklyScore": topWeekly, "activeWeek": week,
	})
	_, err := s.pool.Exec(ctx, `INSERT INTO public_stats (key, data, updated_at)
		VALUES ('overview',$1,now()) ON CONFLICT (key) DO UPDATE SET data=$1, updated_at=now()`, data)
	return err
}

func (s *Service) activeWeek(ctx context.Context) string {
	var data []byte
	if err := s.pool.QueryRow(ctx, `SELECT data FROM settings WHERE key='activeWeek'`).Scan(&data); err != nil {
		return "Week 1"
	}
	var d struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(data, &d); err != nil || d.Value == "" {
		return "Week 1"
	}
	return d.Value
}

// PortalStats serves the cached public overview.
func (s *Service) PortalStats(ctx context.Context) map[string]any {
	var raw []byte
	if err := s.pool.QueryRow(ctx, `SELECT data FROM public_stats WHERE key='overview'`).Scan(&raw); err != nil {
		return nil
	}
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	return out
}
