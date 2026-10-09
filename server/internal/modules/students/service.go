package students

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/274lab/server/internal/access"
	"github.com/274lab/server/pkg/hash"
	"github.com/274lab/server/pkg/phones"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound    = errors.New("not found")
	ErrForbidden   = errors.New("forbidden")
	ErrBadInput    = errors.New("invalid input")
	ErrRateLimited = errors.New("too many attempts, try again later")
	ErrNameTaken   = errors.New("name already taken")
)

var emailRe = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

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
	MissedStreak      int      `json:"missedStreak"`
	JoinedAt          *string  `json:"joinedAt"`
}

const studentCols = `id, name, nickname, year, email, phone, parent_phone,
	teacher_phone, subjects, role, subscription_until,
	free_attempts_used, coins, referral_no, suspended, missed_streak, joined_at`

func scanStudent(row interface {
	Scan(...any) error
}) (Student, error) {
	var st Student
	var subUntil *time.Time
	var referralNo, joined *string
	var subjects []string
	var joinedT *time.Time
	err := row.Scan(
		&st.ID, &st.Name, &st.Nickname, &st.Year, &st.Email,
		&st.Phone, &st.ParentPhone, &st.TeacherPhone,
		&subjects, &st.Role, &subUntil,
		&st.FreeAttemptsUsed, &st.Coins, &referralNo, &st.Suspended, &st.MissedStreak, &joinedT,
	)
	if err != nil {
		return st, err
	}
	st.Subjects = subjects
	if st.Subjects == nil {
		st.Subjects = []string{}
	}
	st.SubscriptionUntil = formatTime(subUntil)
	st.ReferralNo = referralNo
	if joinedT != nil {
		s := joinedT.UTC().Format(time.RFC3339)
		joined = &s
	}
	st.JoinedAt = joined
	return st, nil
}

func formatTime(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.UTC().Format(time.RFC3339)
	return &s
}

func (s *Service) Get(ctx context.Context, id string) (Student, error) {
	st, err := scanStudent(s.pool.QueryRow(ctx, `SELECT `+studentCols+` FROM students WHERE id=$1`, id))
	if err != nil {
		return st, ErrNotFound
	}
	return st, nil
}

type UpdateInput struct {
	Nickname     *string  `json:"nickname"`
	Email        *string  `json:"email"`
	Phone        *string  `json:"phone"`
	ParentPhone  *string  `json:"parentPhone"`
	TeacherPhone *string  `json:"teacherPhone"`
	Subjects     []string `json:"subjects"`
	Name         *string  `json:"name"`
	HasSubjects  bool
}

// Update applies owner-editable profile fields and syncs the public profile.
func (s *Service) Update(ctx context.Context, id string, in UpdateInput) (Student, error) {
	var empty Student
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return empty, err
	}
	defer tx.Rollback(ctx)

	var curName string
	if err := tx.QueryRow(ctx, `SELECT name FROM students WHERE id=$1`, id).Scan(&curName); err != nil {
		return empty, ErrNotFound
	}
	sets := []string{"updated_at = now()"}
	args := []any{}
	add := func(expr string, v any) {
		args = append(args, v)
		sets = append(sets, expr+" = $"+itoa(len(args)))
	}
	var newName *string
	if in.Name != nil {
		n := strings.TrimSpace(*in.Name)
		if len(n) < 3 || len(n) > 50 {
			return empty, ErrBadInput
		}
		nl := strings.ToLower(n)
		var clash bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM students WHERE name_lower=$1 AND id<>$2)`, nl, id).Scan(&clash); err != nil {
			return empty, err
		}
		if clash {
			return empty, ErrNameTaken
		}
		newName = &n
		add("name", n)
		add("name_lower", nl)
	}
	if in.Nickname != nil {
		add("nickname", *in.Nickname)
		add("nickname_lower", strings.ToLower(strings.TrimSpace(*in.Nickname)))
	}
	if in.Email != nil {
		e := strings.ToLower(strings.TrimSpace(*in.Email))
		if e != "" && !emailRe.MatchString(e) {
			return empty, ErrBadInput
		}
		add("email", e)
	}
	if in.Phone != nil {
		add("phone", phones.Normalize(*in.Phone))
	}
	if in.ParentPhone != nil {
		add("parent_phone", phones.Normalize(*in.ParentPhone))
	}
	if in.TeacherPhone != nil {
		add("teacher_phone", phones.Normalize(*in.TeacherPhone))
	}
	_ = newName
	if in.HasSubjects {
		args = append(args, in.Subjects)
		sets = append(sets, "subjects = $"+itoa(len(args)))
	}
	args = append(args, id)
	q := "UPDATE students SET " + strings.Join(sets, ", ") + " WHERE id = $" + itoa(len(args))
	if _, err := tx.Exec(ctx, q, args...); err != nil {
		return empty, err
	}
	// Sync public profile (safe subset).
	var name, nickname, year string
	var words []string
	var nickLower string
	if err := tx.QueryRow(ctx, `SELECT name, nickname, year, name_lower_words, nickname_lower FROM students WHERE id=$1`, id).Scan(&name, &nickname, &year, &words, &nickLower); err != nil {
		return empty, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO student_profiles
		(student_id, name, nickname, name_lower_words, nickname_lower, year, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,now())
		ON CONFLICT (student_id) DO UPDATE SET name=$2, nickname=$3,
		name_lower_words=$4, nickname_lower=$5, year=$6, updated_at=now()`,
		id, name, nickname, words, nickLower, year); err != nil {
		return empty, err
	}
	if err := tx.Commit(ctx); err != nil {
		return empty, err
	}
	return s.Get(ctx, id)
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

func (s *Service) Status(ctx context.Context, id string) (access.Status, error) {
	var st access.Student
	var subUntil, trialStart, joined *time.Time
	var suspended bool
	var freeUsed int
	err := s.pool.QueryRow(ctx, `SELECT suspended, subscription_until, free_attempts_used,
		trial_started_at, joined_at FROM students WHERE id=$1`, id,
	).Scan(&suspended, &subUntil, &freeUsed, &trialStart, &joined)
	if err != nil {
		return access.Status{}, ErrNotFound
	}
	st = access.Student{Suspended: suspended, SubscriptionUntil: subUntil,
		FreeAttemptsUsed: freeUsed, TrialStartedAt: trialStart, JoinedAt: joined}
	return access.For(st, time.Now().UTC()), nil
}

// --- Admin ---

type Page struct {
	Students []Student `json:"students"`
	Total    int       `json:"total"`
	Page     int       `json:"page"`
	PageSize int       `json:"pageSize"`
}

func (s *Service) List(ctx context.Context, year string, page, pageSize int) (Page, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	where := ""
	args := []any{}
	if year != "" {
		where = "WHERE year = $1"
		args = append(args, year)
	}
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM students `+where, args...).Scan(&total); err != nil {
		return Page{}, err
	}
	limit := pageSize
	offset := (page - 1) * pageSize
	args = append(args, limit, offset)
	q := `SELECT ` + studentCols + ` FROM students ` + where + ` ORDER BY name_lower LIMIT $` +
		itoa(len(args)-1) + ` OFFSET $` + itoa(len(args))
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return Page{}, err
	}
	defer rows.Close()
	out := []Student{}
	for rows.Next() {
		st, err := scanStudent(rows)
		if err != nil {
			return Page{}, err
		}
		out = append(out, st)
	}
	return Page{Students: out, Total: total, Page: page, PageSize: pageSize}, nil
}

// Grant sets subscriptionUntil. Any ISO-8601 expiry is accepted and stored
// in canonical UTC form.
func (s *Service) Grant(ctx context.Context, id, expiry string) (string, error) {
	parsed, err := time.Parse(time.RFC3339Nano, expiry)
	if err != nil {
		return "", ErrBadInput
	}
	var exists bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM students WHERE id=$1)`, id).Scan(&exists); err != nil || !exists {
		return "", ErrNotFound
	}
	iso := parsed.UTC().Format(time.RFC3339)
	if _, err := s.pool.Exec(ctx, `UPDATE students SET subscription_until=$1, missed_streak=0,
		suspended=false, appealed_at=now(), updated_at=now() WHERE id=$2`, parsed.UTC(), id); err != nil {
		return "", err
	}
	return iso, nil
}

func (s *Service) Delete(ctx context.Context, id string) error {
	res, err := s.pool.Exec(ctx, `DELETE FROM students WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// --- Recovery (suspended accounts) ---

const (
	maxRecoveryAttempts = 5
	recoveryCooldown    = 15 * time.Minute
)

func (s *Service) VerifyRecovery(ctx context.Context, authUID, studentID, code string) (bool, string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, "", err
	}
	defer tx.Rollback(ctx)
	var ownerUID, recoveryCode string
	var attempts int
	var lastAttempt *time.Time
	if err := tx.QueryRow(ctx, `SELECT COALESCE(uid,''), COALESCE(recovery_code,''), recovery_attempts,
		last_recovery_attempt FROM students WHERE id=$1 FOR UPDATE`, studentID,
	).Scan(&ownerUID, &recoveryCode, &attempts, &lastAttempt); err != nil {
		return false, "", ErrNotFound
	}
	if ownerUID != "" && ownerUID != authUID {
		return false, "", ErrForbidden
	}
	now := time.Now().UTC()
	var lastMs int64
	if lastAttempt != nil {
		lastMs = lastAttempt.UnixMilli()
	}
	if attempts >= maxRecoveryAttempts && now.UnixMilli()-lastMs < recoveryCooldown.Milliseconds() {
		mins := (recoveryCooldown.Milliseconds() - (now.UnixMilli() - lastMs) + 59999) / 60000
		return false, "", errors.New("too many attempts, try again in " + itoa(int(mins)) + "m")
	}
	if strings.TrimSpace(code) != recoveryCode || recoveryCode == "" {
		newAttempts := attempts + 1
		if lastAttempt == nil || now.Sub(*lastAttempt) > recoveryCooldown {
			newAttempts = 1
		}
		if _, err := tx.Exec(ctx, `UPDATE students SET recovery_attempts=$1, last_recovery_attempt=$2, updated_at=now() WHERE id=$3`,
			newAttempts, now, studentID); err != nil {
			return false, "", err
		}
		if err := tx.Commit(ctx); err != nil {
			return false, "", err
		}
		return false, "", nil
	}
	if _, err := tx.Exec(ctx, `UPDATE students SET missed_streak=0, suspended=false,
		appealed_at=$1, recovery_attempts=0, last_recovery_attempt=NULL, updated_at=now() WHERE id=$2`,
		now, studentID); err != nil {
		return false, "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, "", err
	}
	return true, "", nil
}

type Profile struct {
	StudentID      string   `json:"studentId"`
	Name           string   `json:"name"`
	Nickname       string   `json:"nickname"`
	Year           string   `json:"year"`
	NameLowerWords []string `json:"-"`
	NicknameLower  string   `json:"-"`
}

// SearchProfiles matches by name words or nickname prefix (max 20).
func (s *Service) SearchProfiles(ctx context.Context, q string) ([]Profile, error) {
	out := []Profile{}
	term := strings.ToLower(strings.TrimSpace(q))
	if len(term) < 2 {
		return out, nil
	}
	words := strings.Fields(term)
	rows, err := s.pool.Query(ctx, `SELECT student_id, name, nickname, year, name_lower_words, nickname_lower
		FROM student_profiles LIMIT 2000`)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var p Profile
		if err := rows.Scan(&p.StudentID, &p.Name, &p.Nickname, &p.Year, &p.NameLowerWords, &p.NicknameLower); err != nil {
			continue
		}
		hit := false
		for _, w := range words {
			for _, nw := range p.NameLowerWords {
				if nw == w {
					hit = true
					break
				}
			}
		}
		if !hit && strings.HasPrefix(strings.ToLower(p.NicknameLower), term) {
			hit = true
		}
		if hit {
			out = append(out, p)
			if len(out) >= 20 {
				break
			}
		}
	}
	return out, nil
}

// PublicProfile returns one safe profile row.
func (s *Service) PublicProfile(ctx context.Context, id string) (Profile, error) {
	var p Profile
	err := s.pool.QueryRow(ctx, `SELECT student_id, name, nickname, year FROM student_profiles WHERE student_id=$1`,
		id).Scan(&p.StudentID, &p.Name, &p.Nickname, &p.Year)
	if err != nil {
		return p, ErrNotFound
	}
	return p, nil
}

// AdminSetPassword sets a student's password directly (support flow for
// accounts with no phone on file for SMS reset).
func (s *Service) AdminSetPassword(ctx context.Context, id, newPassword string) error {
	if len(newPassword) < 8 {
		return ErrBadInput
	}
	pw, err := hash.Password(newPassword)
	if err != nil {
		return err
	}
	res, err := s.pool.Exec(ctx, `UPDATE students SET password_hash=$1, reset_code=NULL,
		reset_attempts=0, reset_last_attempt=NULL, updated_at=now() WHERE id=$2`, pw, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
