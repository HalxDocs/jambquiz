package auth

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/274lab/server/pkg/hash"
	"github.com/274lab/server/pkg/ids"
	gojwt "github.com/274lab/server/pkg/jwt"
	"github.com/274lab/server/pkg/phones"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	coinsOnRegister = 20
	coinsOnReferral = 50
	tokenTTL        = 30 * 24 * time.Hour
)

var (
	ErrTaken        = errors.New("name already taken")
	ErrBadLogin     = errors.New("invalid name or password")
	ErrPhoneTaken   = errors.New("phone already registered")
	ErrEmailTaken   = errors.New("email already registered")
	ErrBadPioneer   = errors.New("invalid pioneer code")
	ErrWeakPassword = errors.New("password must be at least 8 characters")
	ErrShortName    = errors.New("name must be at least 3 characters")
	ErrBadEmail     = errors.New("enter a valid email address")
	ErrBadPhone     = errors.New("enter a valid phone number")
)

var emailRe = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

func lowerWords(nameLower string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, w := range strings.Fields(nameLower) {
		if !seen[w] {
			seen[w] = true
			out = append(out, w)
		}
	}
	return out
}

type Service struct {
	pool   *pgxpool.Pool
	secret string
}

func NewService(pool *pgxpool.Pool, secret string) *Service {
	return &Service{pool: pool, secret: secret}
}

func (s *Service) sign(id, role string) (string, error) {
	return gojwt.Sign(s.secret, id, role, tokenTTL)
}

// Student is the safe public shape (no password hash).
type Student struct {
	ID                string   `json:"id"`
	Name              string   `json:"name"`
	Nickname          string   `json:"nickname"`
	Year              string   `json:"year"`
	Email             string   `json:"email"`
	Phone             string   `json:"phone"`
	ParentPhone       string   `json:"parentPhone"`
	TeacherPhone      string   `json:"teacherPhone"`
	Subjects          []string `json:"subjects"`
	Role              string   `json:"role"`
	SubscriptionUntil *string  `json:"subscriptionUntil"`
	FreeAttemptsUsed  int      `json:"freeAttemptsUsed"`
	Coins             int      `json:"coins"`
	ReferralNo        *string  `json:"referralNo"`
	Suspended         bool     `json:"suspended"`
}

type RegisterInput struct {
	Name         string
	Nickname     string
	Year         string
	Password     string
	Email        string
	Phone        string
	ParentPhone  string
	TeacherPhone string
	Subjects     []string
	ReferredBy   string
}

func scanStudent(row pgx.Row) (Student, error) {
	var st Student
	var subUntil, referralNo *string
	var subjects []string
	err := row.Scan(
		&st.ID, &st.Name, &st.Nickname, &st.Year, &st.Email,
		&st.Phone, &st.ParentPhone, &st.TeacherPhone,
		&subjects, &st.Role, &subUntil,
		&st.FreeAttemptsUsed, &st.Coins, &referralNo, &st.Suspended,
	)
	if err != nil {
		return st, err
	}
	st.Subjects = subjects
	if st.Subjects == nil {
		st.Subjects = []string{}
	}
	st.SubscriptionUntil = subUntil
	st.ReferralNo = referralNo
	return st, nil
}

const studentCols = `id, name, nickname, year, email, phone, parent_phone,
	teacher_phone, subjects, role, subscription_until,
	free_attempts_used, coins, referral_no, suspended`

func (s *Service) Register(ctx context.Context, in RegisterInput) (Student, string, error) {
	var empty Student
	name := strings.TrimSpace(in.Name)
	if len(name) < 3 {
		return empty, "", ErrShortName
	}
	if len(in.Password) < 8 {
		return empty, "", ErrWeakPassword
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if email != "" && !emailRe.MatchString(email) {
		return empty, "", ErrBadEmail
	}
	nameLower := strings.ToLower(name)

	var exists bool
	if err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM students WHERE name_lower = $1)`, nameLower,
	).Scan(&exists); err != nil {
		return empty, "", err
	}
	if exists {
		return empty, "", ErrTaken
	}

	pwHash, err := hash.Password(in.Password)
	if err != nil {
		return empty, "", err
	}
	subjects := in.Subjects
	if subjects == nil {
		subjects = []string{}
	}
	now := time.Now().UTC()
	id := ids.New()

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return empty, "", err
	}
	defer tx.Rollback(ctx)

	// Sequential 2-digit referral number via locked counter row.
	var next int
	err = tx.QueryRow(ctx, `SELECT (data->>'next')::int FROM admin_settings WHERE id='counter_referrals' FOR UPDATE`).Scan(&next)
	if err != nil {
		next = 1
		if _, err := tx.Exec(ctx, `INSERT INTO admin_settings (id, data) VALUES ('counter_referrals', '{"next":2}') ON CONFLICT (id) DO NOTHING`); err != nil {
			return empty, "", err
		}
	} else {
		if _, err := tx.Exec(ctx, `UPDATE admin_settings SET data = jsonb_set(data, '{next}', to_jsonb($1::int)), updated_at = now() WHERE id='counter_referrals'`, next+1); err != nil {
			return empty, "", err
		}
	}
	refNo := ""
	if next < 10 {
		refNo = "0"
	}
	refNo += itoa(next)

	var createdID string
	err = tx.QueryRow(ctx, `INSERT INTO students
		(id, password_hash, name, name_lower, name_lower_words, nickname, nickname_lower,
		 year, email, phone, parent_phone, teacher_phone, subjects, referred_by,
		 referral_no, free_attempts_used, trial_started_at, joined_at, coins)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,$16,$16,$17)
		RETURNING id`,
		id, pwHash, name, nameLower, lowerWords(nameLower),
		in.Nickname, strings.ToLower(strings.TrimSpace(in.Nickname)),
		in.Year, email,
		phones.Normalize(in.Phone), phones.Normalize(in.ParentPhone), phones.Normalize(in.TeacherPhone),
		subjects, strings.TrimSpace(in.ReferredBy),
		refNo, now, coinsOnRegister,
	).Scan(&createdID)
	if err != nil {
		return empty, "", err
	}

	if _, err := tx.Exec(ctx, `INSERT INTO student_profiles
		(student_id, name, nickname, name_lower_words, nickname_lower, year)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		createdID, name, in.Nickname, lowerWords(nameLower),
		strings.ToLower(strings.TrimSpace(in.Nickname)), in.Year,
	); err != nil {
		return empty, "", err
	}

	if _, err := tx.Exec(ctx, `INSERT INTO coin_ledger (id, student_id, uid, delta, reason)
		VALUES ($1,$2,'',$3,'register')`, ids.New(), createdID, coinsOnRegister); err != nil {
		return empty, "", err
	}

	// Referral bonus to the referrer (best-effort inside the same txn).
	if rb := strings.TrimSpace(in.ReferredBy); rb != "" {
		var refID string
		var refCoins int
		if err := tx.QueryRow(ctx,
			`SELECT id, coins FROM students WHERE referral_no = $1 LIMIT 1`, rb,
		).Scan(&refID, &refCoins); err == nil && refID != createdID {
			if _, err := tx.Exec(ctx, `UPDATE students SET coins = coins + $1, updated_at = now() WHERE id = $2`, coinsOnReferral, refID); err == nil {
				tx.Exec(ctx, `INSERT INTO coin_ledger (id, student_id, uid, delta, reason, ref)
					VALUES ($1,$2,'',$3,'referral',$4)`, ids.New(), refID, coinsOnReferral, createdID)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return empty, "", err
	}

	st, err := s.getStudent(ctx, createdID)
	if err != nil {
		return empty, "", err
	}
	tok, err := s.sign(st.ID, st.Role)
	if err != nil {
		return empty, "", err
	}
	return st, tok, nil
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	digits := []byte{}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

func (s *Service) getStudent(ctx context.Context, id string) (Student, error) {
	return scanStudent(s.pool.QueryRow(ctx,
		`SELECT `+studentCols+` FROM students WHERE id = $1`, id))
}

func (s *Service) Login(ctx context.Context, name, password string) (Student, string, error) {
	var empty Student
	nameLower := strings.ToLower(strings.TrimSpace(name))
	var st Student
	var pwHash string
	var subjects []string
	var subUntil, referralNo *string
	err := s.pool.QueryRow(ctx, `SELECT `+studentCols+`, password_hash FROM students WHERE name_lower = $1`, nameLower).Scan(
		&st.ID, &st.Name, &st.Nickname, &st.Year, &st.Email,
		&st.Phone, &st.ParentPhone, &st.TeacherPhone,
		&subjects, &st.Role, &subUntil,
		&st.FreeAttemptsUsed, &st.Coins, &referralNo, &st.Suspended, &pwHash,
	)
	if err != nil {
		return empty, "", ErrBadLogin
	}
	if !hash.Check(pwHash, password) {
		return empty, "", ErrBadLogin
	}
	st.Subjects = subjects
	if st.Subjects == nil {
		st.Subjects = []string{}
	}
	st.SubscriptionUntil = subUntil
	st.ReferralNo = referralNo
	tok, err := s.sign(st.ID, st.Role)
	if err != nil {
		return empty, "", err
	}
	return st, tok, nil
}

func (s *Service) ChangePassword(ctx context.Context, id, current, next string) error {
	if len(next) < 8 {
		return ErrWeakPassword
	}
	var pwHash string
	if err := s.pool.QueryRow(ctx, `SELECT password_hash FROM students WHERE id = $1`, id).Scan(&pwHash); err != nil {
		return ErrBadLogin
	}
	if !hash.Check(pwHash, current) {
		return ErrBadLogin
	}
	nh, err := hash.Password(next)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `UPDATE students SET password_hash = $1, updated_at = now() WHERE id = $2`, nh, id)
	return err
}

// --- Teachers (phone identity, separate JWT role) ---

type Teacher struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Phone     string `json:"phone"`
	IsPioneer bool   `json:"isPioneer"`
}

type TeacherRegisterInput struct {
	Name        string
	Email       string
	Phone       string
	Password    string
	PioneerCode string
}

func (s *Service) RegisterTeacher(ctx context.Context, in TeacherRegisterInput) (Teacher, string, error) {
	var empty Teacher
	name := strings.TrimSpace(in.Name)
	if len(name) < 3 {
		return empty, "", ErrShortName
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if !emailRe.MatchString(email) {
		return empty, "", ErrBadEmail
	}
	phone := phones.Normalize(in.Phone)
	if phone == "" {
		return empty, "", ErrBadPhone
	}
	if len(in.Password) < 8 {
		return empty, "", ErrWeakPassword
	}

	var referredBy *string
	if code := strings.TrimSpace(in.PioneerCode); code != "" {
		var pid string
		var isPioneer bool
		if err := s.pool.QueryRow(ctx,
			`SELECT t.id, t.is_pioneer FROM pioneer_codes p JOIN teachers t ON t.id = p.teacher_id WHERE p.code = $1`, code,
		).Scan(&pid, &isPioneer); err != nil || !isPioneer {
			return empty, "", ErrBadPioneer
		}
		referredBy = &pid
	}

	var taken bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM teachers WHERE phone = $1)`, phone).Scan(&taken); err != nil {
		return empty, "", err
	}
	if taken {
		return empty, "", ErrPhoneTaken
	}
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM teachers WHERE email = $1)`, email).Scan(&taken); err != nil {
		return empty, "", err
	}
	if taken {
		return empty, "", ErrEmailTaken
	}

	pwHash, err := hash.Password(in.Password)
	if err != nil {
		return empty, "", err
	}
	t := Teacher{ID: ids.New(), Name: name, Email: email, Phone: phone}
	if _, err := s.pool.Exec(ctx, `INSERT INTO teachers
		(id, password_hash, name, email, phone, referred_by_pioneer_id)
		VALUES ($1,$2,$3,$4,$5,$6)`, t.ID, pwHash, name, email, phone, referredBy); err != nil {
		return empty, "", err
	}
	tok, err := s.sign(t.ID, "teacher")
	if err != nil {
		return empty, "", err
	}
	return t, tok, nil
}

func (s *Service) LoginTeacher(ctx context.Context, phone, password string) (Teacher, string, error) {
	var empty Teacher
	p := phones.Normalize(phone)
	var t Teacher
	var pwHash string
	err := s.pool.QueryRow(ctx, `SELECT id, name, email, phone, is_pioneer, password_hash FROM teachers WHERE phone = $1`, p).Scan(
		&t.ID, &t.Name, &t.Email, &t.Phone, &t.IsPioneer, &pwHash,
	)
	if err != nil || !hash.Check(pwHash, password) {
		return empty, "", ErrBadLogin
	}
	tok, err := s.sign(t.ID, "teacher")
	if err != nil {
		return empty, "", err
	}
	return t, tok, nil
}
