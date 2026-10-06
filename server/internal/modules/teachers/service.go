package teachers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"math/rand"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/274lab/server/internal/ratelimit"
	"github.com/274lab/server/pkg/phones"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	ratePerStudent    = 500
	minTestsPerMonth  = 3
	maxPaidPerMonth   = 30
	pioneerPerStudent = 200
	pioneerMaxPaid    = 20
	pioneerStartMonth = "2026-10"
	pioneerEndMonth   = "2026-12"
)

var (
	ErrNotFound      = errors.New("not found")
	ErrForbidden     = errors.New("forbidden")
	ErrBadInput      = errors.New("invalid input")
	ErrRateLimited   = errors.New("too many requests, try again later")
	ErrTaken         = errors.New("already exists")
	ErrNotConfigured = errors.New("not configured")
)

type Service struct {
	pool           *pgxpool.Pool
	paystackSecret string
	client         *http.Client
}

func NewService(pool *pgxpool.Pool, paystackSecret string) *Service {
	return &Service{pool: pool, paystackSecret: paystackSecret, client: &http.Client{Timeout: 20 * time.Second}}
}

type Teacher struct {
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	Email             string  `json:"email"`
	Phone             string  `json:"phone"`
	AccountNumber     string  `json:"accountNumber"`
	BankName          string  `json:"bankName"`
	AccountName       string  `json:"accountName"`
	BankVerified      bool    `json:"bankVerified"`
	IsPioneer         bool    `json:"isPioneer"`
	PioneerCode       *string `json:"pioneerCode"`
	ReferredByPioneer *string `json:"referredByPioneerId"`
	CreatedAt         string  `json:"createdAt"`
}

func (s *Service) get(ctx context.Context, id string) (Teacher, error) {
	var t Teacher
	var pioneerCode, referredBy *string
	var createdT time.Time
	err := s.pool.QueryRow(ctx, `SELECT id, name, email, phone, account_number, bank_name,
		account_name, bank_verified, is_pioneer, pioneer_code, referred_by_pioneer_id, created_at
		FROM teachers WHERE id=$1`, id).Scan(
		&t.ID, &t.Name, &t.Email, &t.Phone, &t.AccountNumber, &t.BankName,
		&t.AccountName, &t.BankVerified, &t.IsPioneer, &pioneerCode, &referredBy, &createdT)
	if err != nil {
		return t, ErrNotFound
	}
	t.PioneerCode = pioneerCode
	t.ReferredByPioneer = referredBy
	t.CreatedAt = createdT.UTC().Format(time.RFC3339)
	return t, nil
}

// linkedStudents finds students by teacher phone (canonical + '+' variant).
func (s *Service) linkedStudents(ctx context.Context, teacherID, teacherPhone string) []map[string]string {
	seen := map[string]map[string]string{}
	add := func(id, name, phone, parent string) {
		if _, ok := seen[id]; !ok {
			seen[id] = map[string]string{"id": id, "name": name, "phone": phone, "parent": parent}
		}
	}
	if canonical := phones.Normalize(teacherPhone); canonical != "" {
		rows, err := s.pool.Query(ctx, `SELECT id, name, phone, parent_phone FROM students
			WHERE teacher_phone IN ($1,$2) LIMIT 500`, canonical, "+"+canonical)
		if err == nil {
			for rows.Next() {
				var id, name, phone, parent string
				if err := rows.Scan(&id, &name, &phone, &parent); err == nil {
					add(id, name, phone, parent)
				}
			}
			rows.Close()
		}
	}
	out := []map[string]string{}
	for _, v := range seen {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i]["name"] < out[j]["name"] })
	return out
}

type monthCounts map[string]int

// scoreSummary groups a student's scores into monthly test counts (distinct
// weeks per month) plus the 15 most recent scores.
func (s *Service) scoreSummary(ctx context.Context, studentID string) (monthCounts, []map[string]any) {
	counts := monthCounts{}
	recent := []map[string]any{}
	rows, err := s.pool.Query(ctx, `SELECT subject, week, score,
		COALESCE(date, created_at) FROM scores WHERE student_id=$1
		ORDER BY COALESCE(date, created_at) DESC LIMIT 300`, studentID)
	if err != nil {
		return counts, recent
	}
	defer rows.Close()
	type row struct {
		subject, week string
		score         int
		at            time.Time
	}
	all := []row{}
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.subject, &r.week, &r.score, &r.at); err == nil {
			all = append(all, r)
		}
	}
	months := map[string]map[string]bool{}
	for _, r := range all {
		m := r.at.UTC().Format("2006-01")
		if months[m] == nil {
			months[m] = map[string]bool{}
		}
		key := strings.TrimSpace(r.week)
		if key == "" {
			key = r.at.UTC().Format("2006-01-02")
		}
		months[m][key] = true
		if len(recent) < 15 {
			recent = append(recent, map[string]any{
				"week": r.week, "subject": r.subject, "score": r.score,
				"date": r.at.UTC().Format(time.RFC3339),
			})
		}
	}
	for m, set := range months {
		counts[m] = len(set)
	}
	return counts, recent
}

func earningsFromCounts(lists []monthCounts) (map[string]int, map[string]int) {
	earn := map[string]int{}
	qual := map[string]int{}
	for _, counts := range lists {
		for m, c := range counts {
			if c >= minTestsPerMonth {
				qual[m]++
				if qual[m] <= maxPaidPerMonth {
					earn[m] += ratePerStudent
				}
			}
		}
	}
	return earn, qual
}

func pioneerBonusFromCounts(lists []monthCounts) (map[string]int, map[string]int) {
	earn := map[string]int{}
	qual := map[string]int{}
	for _, counts := range lists {
		for m, c := range counts {
			if m < pioneerStartMonth || m > pioneerEndMonth {
				continue
			}
			if c >= minTestsPerMonth {
				qual[m]++
				if qual[m] <= pioneerMaxPaid {
					earn[m] += pioneerPerStudent
				}
			}
		}
	}
	return earn, qual
}

type StudentRow struct {
	StudentID     string           `json:"studentId"`
	Name          string           `json:"name"`
	Phone         string           `json:"phone,omitempty"`
	MonthlyCounts monthCounts      `json:"monthlyCounts,omitempty"`
	RecentScores  []map[string]any `json:"recentScores,omitempty"`
	TotalTests    int              `json:"totalTests,omitempty"`
}

type Dashboard struct {
	LinkedCount            int            `json:"linkedCount"`
	Teacher                Teacher        `json:"teacher"`
	MonthsEarnings         map[string]int `json:"monthsEarnings"`
	QualifiedCounts        map[string]int `json:"qualifiedCounts"`
	PioneerEarnings        map[string]int `json:"pioneerEarnings"`
	PioneerQualifiedCounts map[string]int `json:"pioneerQualifiedCounts"`
	Students               []StudentRow   `json:"students"`
}

func (s *Service) Dashboard(ctx context.Context, teacherID string) (Dashboard, error) {
	var out Dashboard
	t, err := s.get(ctx, teacherID)
	if err != nil {
		return out, err
	}
	linked := s.linkedStudents(ctx, teacherID, t.Phone)
	countsList := []monthCounts{}
	rows := []StudentRow{}
	for _, st := range linked {
		counts, recent := s.scoreSummary(ctx, st["id"])
		countsList = append(countsList, counts)
		phone := st["phone"]
		if phone == "" {
			phone = st["parent"]
		}
		rows = append(rows, StudentRow{StudentID: st["id"], Name: orDefault(st["name"], "Student"),
			Phone: phone, MonthlyCounts: counts, RecentScores: recent})
	}
	earn, qual := earningsFromCounts(countsList)
	out = Dashboard{LinkedCount: len(rows), Teacher: t, MonthsEarnings: earn,
		QualifiedCounts: qual, PioneerEarnings: map[string]int{},
		PioneerQualifiedCounts: map[string]int{}, Students: rows}
	if t.IsPioneer {
		refCounts := s.referralCounts(ctx, teacherID)
		pe, pq := pioneerBonusFromCounts(refCounts)
		out.PioneerEarnings = pe
		out.PioneerQualifiedCounts = pq
	}
	return out, nil
}

func (s *Service) referralCounts(ctx context.Context, pioneerID string) []monthCounts {
	out := []monthCounts{}
	rows, err := s.pool.Query(ctx, `SELECT id, phone FROM teachers WHERE referred_by_pioneer_id=$1`, pioneerID)
	if err != nil {
		return out
	}
	defer rows.Close()
	type rt struct{ id, phone string }
	var refs []rt
	for rows.Next() {
		var r rt
		if err := rows.Scan(&r.id, &r.phone); err == nil {
			refs = append(refs, r)
		}
	}
	for _, r := range refs {
		for _, st := range s.linkedStudents(ctx, r.id, r.phone) {
			counts, _ := s.scoreSummary(ctx, st["id"])
			out = append(out, counts)
		}
	}
	return out
}

func orDefault(s, d string) string {
	if s == "" {
		return d
	}
	return s
}

// --- Details (bank verification via Paystack) ---

var bankCache struct {
	sync.Mutex
	at    time.Time
	banks []map[string]string
}

func (s *Service) UpdateDetails(ctx context.Context, teacherID, accountNumber, bankName string) (map[string]any, error) {
	acct := nonDigits(accountNumber)
	if len(acct) < 10 {
		return nil, ErrBadInput
	}
	bank := strings.TrimSpace(bankName)
	if len(bank) < 2 {
		return nil, ErrBadInput
	}
	if s.paystackSecret == "" {
		return nil, ErrNotConfigured
	}
	if _, err := s.get(ctx, teacherID); err != nil {
		return nil, err
	}
	info, err := s.resolveBankCode(ctx, bank)
	if err != nil {
		return nil, err
	}
	resolved, err := s.resolveAccount(ctx, acct, info["code"])
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	if _, err := s.pool.Exec(ctx, `UPDATE teachers SET account_number=$1, bank_name=$2,
		bank_code=$3, account_name=$4, bank_verified=true, bank_verified_at=$5, updated_at=now() WHERE id=$6`,
		acct, info["name"], info["code"], resolved, now, teacherID); err != nil {
		return nil, err
	}
	return map[string]any{"accountNumber": acct, "bankName": info["name"],
		"accountName": resolved, "bankVerified": true}, nil
}

func nonDigits(s string) string {
	out := []byte{}
	for i := 0; i < len(s); i++ {
		if s[i] >= '0' && s[i] <= '9' {
			out = append(out, s[i])
		}
	}
	return string(out)
}

func bankKey(name string) string {
	out := []byte{}
	for _, r := range strings.ToLower(name) {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			out = append(out, byte(r))
		}
	}
	return string(out)
}

func (s *Service) fetchBanks(ctx context.Context) ([]map[string]string, error) {
	bankCache.Lock()
	if time.Since(bankCache.at) < 6*time.Hour && len(bankCache.banks) > 0 {
		defer bankCache.Unlock()
		return bankCache.banks, nil
	}
	bankCache.Unlock()
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://api.paystack.co/bank?currency=NGN", nil)
	req.Header.Set("Authorization", "Bearer "+s.paystackSecret)
	res, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var decoded struct {
		Status bool `json:"status"`
		Data   []struct {
			Name string `json:"name"`
			Code string `json:"code"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &decoded); err != nil || !decoded.Status {
		return nil, errors.New("bank list unavailable")
	}
	banks := []map[string]string{}
	for _, b := range decoded.Data {
		banks = append(banks, map[string]string{"name": b.Name, "code": b.Code})
	}
	bankCache.Lock()
	bankCache.banks = banks
	bankCache.at = time.Now()
	bankCache.Unlock()
	return banks, nil
}

func (s *Service) resolveBankCode(ctx context.Context, bank string) (map[string]string, error) {
	banks, err := s.fetchBanks(ctx)
	if err != nil {
		return nil, err
	}
	key := bankKey(bank)
	for _, b := range banks {
		if bankKey(b["name"]) == key || strings.Contains(bankKey(b["name"]), key) || strings.Contains(key, bankKey(b["name"])) {
			return b, nil
		}
	}
	return nil, ErrBadInput
}

func (s *Service) resolveAccount(ctx context.Context, acct, code string) (string, error) {
	req, _ := http.NewRequestWithContext(ctx, "GET",
		"https://api.paystack.co/bank/resolve?account_number="+acct+"&bank_code="+code, nil)
	req.Header.Set("Authorization", "Bearer "+s.paystackSecret)
	res, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var decoded struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			AccountName string `json:"account_name"`
		} `json:"data"`
	}
	_ = json.Unmarshal(raw, &decoded)
	if !decoded.Status || decoded.Data.AccountName == "" {
		return "", errors.New("account could not be verified: " + decoded.Message)
	}
	return strings.TrimSpace(decoded.Data.AccountName), nil
}

// --- Phone ---

func (s *Service) UpdatePhone(ctx context.Context, teacherID, phone string) (string, int, error) {
	normalized := phones.Normalize(phone)
	if normalized == "" {
		return "", 0, ErrBadInput
	}
	var cur string
	if err := s.pool.QueryRow(ctx, `SELECT phone FROM teachers WHERE id=$1`, teacherID).Scan(&cur); err != nil {
		return "", 0, ErrNotFound
	}
	if phones.Normalize(cur) == normalized {
		return normalized, 0, nil
	}
	var clash string
	_ = s.pool.QueryRow(ctx, `SELECT id FROM teachers WHERE phone=$1`, normalized).Scan(&clash)
	if clash != "" && clash != teacherID {
		return "", 0, ErrTaken
	}
	if !ratelimit.Allow(ctx, s.pool, "teacherPhone:"+teacherID, 5, 60*60*1000) {
		return "", 0, ErrRateLimited
	}
	now := time.Now().UTC()
	if _, err := s.pool.Exec(ctx, `UPDATE teachers SET phone=$1, phone_updated_at=$2, updated_at=now() WHERE id=$3`,
		normalized, now, teacherID); err != nil {
		return "", 0, err
	}
	old := phones.Normalize(cur)
	migrated := 0
	if old != "" {
		res, err := s.pool.Exec(ctx, `UPDATE students SET teacher_phone=$1, updated_at=now()
			WHERE teacher_phone IN ($2,$3)`, normalized, old, "+"+old)
		if err == nil {
			migrated = int(res.RowsAffected())
		}
	}
	return normalized, migrated, nil
}

// --- Pioneers (admin) ---

func (s *Service) MakePioneer(ctx context.Context, teacherID string) (string, error) {
	var isPioneer bool
	var existing *string
	if err := s.pool.QueryRow(ctx, `SELECT is_pioneer, pioneer_code FROM teachers WHERE id=$1`,
		teacherID).Scan(&isPioneer, &existing); err != nil {
		return "", ErrNotFound
	}
	if isPioneer && existing != nil && *existing != "" {
		return "", ErrTaken
	}
	code := ""
	for i := 0; i < 5; i++ {
		c := 1000 + rand.Intn(9000)
		cs := itoa(c)
		var taken bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pioneer_codes WHERE code=$1)`, cs).Scan(&taken); err != nil || taken {
			continue
		}
		code = cs
		break
	}
	if code == "" {
		return "", errors.New("could not generate code, try again")
	}
	now := time.Now().UTC()
	if _, err := s.pool.Exec(ctx, `UPDATE teachers SET is_pioneer=true, pioneer_code=$1, pioneer_since=$2, updated_at=now() WHERE id=$3`,
		code, now, teacherID); err != nil {
		return "", err
	}
	if _, err := s.pool.Exec(ctx, `INSERT INTO pioneer_codes (code, teacher_id, created_at) VALUES ($1,$2,$3)`,
		code, teacherID, now); err != nil {
		return "", err
	}
	return code, nil
}

func (s *Service) RemovePioneer(ctx context.Context, teacherID string) error {
	var code *string
	if err := s.pool.QueryRow(ctx, `SELECT pioneer_code FROM teachers WHERE id=$1`, teacherID).Scan(&code); err != nil {
		return ErrNotFound
	}
	if code != nil && *code != "" {
		s.pool.Exec(ctx, `DELETE FROM pioneer_codes WHERE code=$1`, *code)
	}
	_, err := s.pool.Exec(ctx, `UPDATE teachers SET is_pioneer=false, pioneer_code=NULL, pioneer_since=NULL, updated_at=now() WHERE id=$1`, teacherID)
	return err
}

type ReferredTeacher struct {
	TeacherID     string       `json:"teacherId"`
	Name          string       `json:"name"`
	Email         string       `json:"email"`
	Phone         string       `json:"phone"`
	Students      []StudentRow `json:"students"`
	TotalStudents int          `json:"totalStudents"`
	TotalTests    int          `json:"totalTests"`
}

func (s *Service) PioneerDashboard(ctx context.Context, teacherID string) ([]ReferredTeacher, error) {
	t, err := s.get(ctx, teacherID)
	if err != nil {
		return nil, err
	}
	if !t.IsPioneer {
		return nil, ErrForbidden
	}
	rows, err := s.pool.Query(ctx, `SELECT id, name, email, phone FROM teachers WHERE referred_by_pioneer_id=$1`, teacherID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type ref struct{ id, name, email, phone string }
	refs := []ref{}
	for rows.Next() {
		var r ref
		if err := rows.Scan(&r.id, &r.name, &r.email, &r.phone); err == nil {
			refs = append(refs, r)
		}
	}
	out := []ReferredTeacher{}
	for _, r := range refs {
		linked := s.linkedStudents(ctx, r.id, r.phone)
		students := []StudentRow{}
		total := 0
		for _, st := range linked {
			counts, _ := s.scoreSummary(ctx, st["id"])
			n := 0
			for _, c := range counts {
				n += c
			}
			total += n
			students = append(students, StudentRow{StudentID: st["id"],
				Name: orDefault(st["name"], "Student"), TotalTests: n})
		}
		out = append(out, ReferredTeacher{TeacherID: r.id, Name: orDefault(r.name, "—"),
			Email: r.email, Phone: r.phone, Students: students,
			TotalStudents: len(linked), TotalTests: total})
	}
	return out, nil
}

// --- Admin ---

type AdminTeacherRow struct {
	Teacher
	LinkedCount            int            `json:"linkedCount"`
	MonthsEarnings         map[string]int `json:"monthsEarnings"`
	QualifiedCounts        map[string]int `json:"qualifiedCounts"`
	PioneerEarnings        map[string]int `json:"pioneerEarnings"`
	PioneerQualifiedCounts map[string]int `json:"pioneerQualifiedCounts"`
	Students               []StudentRow   `json:"students"`
}

type AdminOverview struct {
	Count       int               `json:"count"`
	LatestMonth string            `json:"latestMonth"`
	Months      []string          `json:"months"`
	Teachers    []AdminTeacherRow `json:"teachers"`
}

func (s *Service) AdminOverview(ctx context.Context) (AdminOverview, error) {
	var out AdminOverview
	rows, err := s.pool.Query(ctx, `SELECT id FROM teachers ORDER BY created_at`)
	if err != nil {
		return out, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	months := map[string]bool{}
	for _, id := range ids {
		d, err := s.Dashboard(ctx, id)
		if err != nil {
			continue
		}
		row := AdminTeacherRow{Teacher: d.Teacher, LinkedCount: d.LinkedCount,
			MonthsEarnings: d.MonthsEarnings, QualifiedCounts: d.QualifiedCounts,
			PioneerEarnings: d.PioneerEarnings, PioneerQualifiedCounts: d.PioneerQualifiedCounts,
			Students: d.Students}
		for m := range d.MonthsEarnings {
			months[m] = true
		}
		out.Teachers = append(out.Teachers, row)
	}
	out.Count = len(out.Teachers)
	latest := ""
	for m := range months {
		if m > latest {
			latest = m
		}
		out.Months = append(out.Months, m)
	}
	sort.Strings(out.Months)
	if latest == "" {
		latest = time.Now().UTC().Format("2006-01")
	}
	out.LatestMonth = latest
	return out, nil
}

func (s *Service) DeleteTeacher(ctx context.Context, teacherID string) error {
	var code *string
	if err := s.pool.QueryRow(ctx, `SELECT pioneer_code FROM teachers WHERE id=$1`, teacherID).Scan(&code); err != nil {
		return ErrNotFound
	}
	if code != nil && *code != "" {
		s.pool.Exec(ctx, `DELETE FROM pioneer_codes WHERE code=$1`, *code)
	}
	res, err := s.pool.Exec(ctx, `DELETE FROM teachers WHERE id=$1`, teacherID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
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
