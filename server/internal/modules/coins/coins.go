package coins

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/274lab/server/pkg/ids"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	CoinsOnRegister = 20
	CoinsOnReferral = 50
	CoinsOnTest     = 10
	CoinsOnShare    = 5
)

type CoinPack struct {
	ID       string `json:"id"`
	Coins    int    `json:"coins"`
	PriceNGN int    `json:"priceNgn"`
}

func DefaultPacks() []CoinPack {
	return []CoinPack{
		{ID: "pack5", Coins: 5, PriceNGN: 250},
		{ID: "pack20", Coins: 20, PriceNGN: 500},
	}
}

var (
	ErrNotFound    = errors.New("not found")
	ErrForbidden   = errors.New("forbidden")
	ErrBadInput    = errors.New("invalid input")
	ErrRateLimited = errors.New("too many requests, try again later")
	ErrNoCoins     = errors.New("not enough coins")
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

// Balance returns coins + referral number, allocating a referral number when
// the student has none yet (legacy/backfilled accounts).
func (s *Service) Balance(ctx context.Context, studentID string) (int, *string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, nil, err
	}
	defer tx.Rollback(ctx)
	var coins int
	var refNo *string
	if err := tx.QueryRow(ctx, `SELECT coins, referral_no FROM students WHERE id=$1 FOR UPDATE`,
		studentID).Scan(&coins, &refNo); err != nil {
		return 0, nil, ErrNotFound
	}
	if refNo == nil || *refNo == "" {
		no := nextReferralNo(ctx, tx)
		if _, err := tx.Exec(ctx, `UPDATE students SET referral_no=$1, updated_at=now() WHERE id=$2`, no, studentID); err != nil {
			return 0, nil, err
		}
		refNo = &no
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, nil, err
	}
	return coins, refNo, nil
}

func nextReferralNo(ctx context.Context, tx pgx.Tx) string {
	var next int
	if err := tx.QueryRow(ctx, `SELECT (data->>'next')::int FROM admin_settings WHERE id='counter_referrals' FOR UPDATE`).Scan(&next); err != nil {
		next = 1
		tx.Exec(ctx, `INSERT INTO admin_settings (id, data) VALUES ('counter_referrals', '{"next":2}') ON CONFLICT (id) DO NOTHING`)
	} else {
		tx.Exec(ctx, `UPDATE admin_settings SET data = jsonb_set(data, '{next}', to_jsonb($1::int)), updated_at = now() WHERE id='counter_referrals'`, next+1)
	}
	if next < 10 {
		return "0" + itoa(next)
	}
	return itoa(next)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	out := []byte{}
	for n > 0 {
		out = append([]byte{byte('0' + n%10)}, out...)
		n /= 10
	}
	return string(out)
}

// ShareResult credits +5 once per student-week.
func (s *Service) ShareResult(ctx context.Context, studentID, week, scoreID string) (int, bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback(ctx)
	var coins int
	var uid string
	var shared []byte
	if err := tx.QueryRow(ctx, `SELECT coins, COALESCE(uid,''), shared_tests FROM students WHERE id=$1 FOR UPDATE`,
		studentID).Scan(&coins, &uid, &shared); err != nil {
		return 0, false, ErrNotFound
	}
	weekKey := strings.TrimSpace(week)
	if weekKey == "" && scoreID != "" {
		var w, owner string
		if err := tx.QueryRow(ctx, `SELECT week, student_id FROM scores WHERE id=$1`, scoreID).Scan(&w, &owner); err != nil {
			return 0, false, ErrNotFound
		}
		if owner != studentID {
			return 0, false, ErrForbidden
		}
		weekKey = strings.TrimSpace(w)
	}
	if weekKey == "" {
		return 0, false, ErrBadInput
	}
	done := map[string]bool{}
	_ = json.Unmarshal(nullJSON(shared), &done)
	if done[weekKey] {
		if err := tx.Commit(ctx); err != nil {
			return 0, false, err
		}
		return coins, true, nil
	}
	done[weekKey] = true
	doneJSON, _ := json.Marshal(done)
	coins += CoinsOnShare
	if _, err := tx.Exec(ctx, `UPDATE students SET coins=$1, shared_tests=$2, updated_at=now() WHERE id=$3`,
		coins, doneJSON, studentID); err != nil {
		return 0, false, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO coin_ledger (id, student_id, uid, delta, reason, ref)
		VALUES ($1,$2,$3,$4,'share',$5)`, ids.New(), studentID, uid, CoinsOnShare, weekKey); err != nil {
		return 0, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, false, err
	}
	return coins, false, nil
}

func nullJSON(b []byte) []byte {
	if len(b) == 0 {
		return []byte("{}")
	}
	return b
}

// ListPacks returns configured packs, falling back to defaults when empty.
func (s *Service) ListPacks(ctx context.Context) ([]CoinPack, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, coins, price_ngn FROM coin_packs ORDER BY coins`)
	if err != nil {
		return DefaultPacks(), nil
	}
	defer rows.Close()
	out := []CoinPack{}
	for rows.Next() {
		var p CoinPack
		if err := rows.Scan(&p.ID, &p.Coins, &p.PriceNGN); err == nil {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return DefaultPacks(), nil
	}
	return out, nil
}

// UpsertPack validates and stores a coin pack (admin).
func (s *Service) UpsertPack(ctx context.Context, id string, coins, price int) (string, error) {
	if coins < 1 || coins > 1000 || price < 1 || price > 100000 {
		return "", ErrBadInput
	}
	packID := sanitizePackID(id)
	if packID == "" {
		packID = fmt.Sprintf("pack%d", coins)
	}
	if _, err := s.pool.Exec(ctx, `INSERT INTO coin_packs (id, coins, price_ngn)
		VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET coins=$2, price_ngn=$3`,
		packID, coins, price); err != nil {
		return "", err
	}
	return packID, nil
}

func sanitizePackID(id string) string {
	out := []byte{}
	for i := 0; i < len(id) && len(out) < 30; i++ {
		c := id[i]
		if c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_' {
			out = append(out, c)
		}
	}
	return string(out)
}

// UpdateSquad stores up to 4 validated friend IDs (existing students, not self).
func (s *Service) UpdateSquad(ctx context.Context, studentID string, squad []string) ([]string, error) {
	seen := map[string]bool{}
	clean := []string{}
	for _, f := range squad {
		if f == "" || f == studentID || seen[f] {
			continue
		}
		seen[f] = true
		clean = append(clean, f)
		if len(clean) == 4 {
			break
		}
	}
	var exists bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM students WHERE id=$1)`, studentID).Scan(&exists); err != nil || !exists {
		return nil, ErrNotFound
	}
	for _, fid := range clean {
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM students WHERE id=$1)`, fid).Scan(&exists); err != nil || !exists {
			return nil, fmt.Errorf("%w: squad member no longer exists", ErrBadInput)
		}
	}
	if _, err := s.pool.Exec(ctx, `UPDATE students SET squad=$1, updated_at=now() WHERE id=$2`, clean, studentID); err != nil {
		return nil, err
	}
	return clean, nil
}

type Goat struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Profession   string            `json:"profession"`
	Stars        map[string]int    `json:"stars"`
	Explanations map[string]string `json:"explanations"`
	Comments     map[string]string `json:"comments"`
}

// ListGoats returns all GOATs sorted by name (public, safe fields).
func (s *Service) ListGoats(ctx context.Context) ([]Goat, error) {
	out := []Goat{}
	rows, err := s.pool.Query(ctx, `SELECT id, name, profession, stars, explanations, comments FROM goats ORDER BY name`)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var g Goat
		var stars, expl, comments []byte
		if err := rows.Scan(&g.ID, &g.Name, &g.Profession, &stars, &expl, &comments); err == nil {
			g.Stars = map[string]int{}
			g.Explanations = map[string]string{}
			g.Comments = map[string]string{}
			_ = json.Unmarshal(nullJSON(stars), &g.Stars)
			_ = json.Unmarshal(nullJSON(expl), &g.Explanations)
			_ = json.Unmarshal(nullJSON(comments), &g.Comments)
			out = append(out, g)
		}
	}
	return out, nil
}

func (s *Service) CreateGoat(ctx context.Context, g Goat) (string, error) {
	if g.Name == "" {
		return "", ErrBadInput
	}
	if len(g.Stars) == 0 {
		return "", ErrBadInput
	}
	id := ids.New()
	stars, _ := json.Marshal(g.Stars)
	expl, _ := json.Marshal(g.Explanations)
	comments, _ := json.Marshal(g.Comments)
	if _, err := s.pool.Exec(ctx, `INSERT INTO goats (id, name, profession, stars, explanations, comments)
		VALUES ($1,$2,$3,$4,$5,$6)`, id, g.Name, g.Profession, stars, expl, comments); err != nil {
		return "", err
	}
	return id, nil
}

func (s *Service) UpdateGoat(ctx context.Context, id string, g Goat) error {
	if g.Name == "" || len(g.Stars) == 0 {
		return ErrBadInput
	}
	stars, _ := json.Marshal(g.Stars)
	expl, _ := json.Marshal(g.Explanations)
	comments, _ := json.Marshal(g.Comments)
	res, err := s.pool.Exec(ctx, `UPDATE goats SET name=$1, profession=$2, stars=$3,
		explanations=$4, comments=$5, updated_at=now() WHERE id=$6`,
		g.Name, g.Profession, stars, expl, comments, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Service) DeleteGoat(ctx context.Context, id string) error {
	res, err := s.pool.Exec(ctx, `DELETE FROM goats WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Service) WeekGoats(ctx context.Context, week string) ([]string, error) {
	var ids []string
	if err := s.pool.QueryRow(ctx, `SELECT goat_ids FROM goat_weeks WHERE week=$1`, week).Scan(&ids); err != nil {
		return []string{}, nil
	}
	if ids == nil {
		return []string{}, nil
	}
	return ids, nil
}

func (s *Service) SetWeekGoats(ctx context.Context, week string, goatIDs []string) error {
	if len(goatIDs) != 4 {
		return ErrBadInput
	}
	if _, err := s.pool.Exec(ctx, `INSERT INTO goat_weeks (week, goat_ids) VALUES ($1,$2)
		ON CONFLICT (week) DO UPDATE SET goat_ids=$2`, week, goatIDs); err != nil {
		return err
	}
	return nil
}
