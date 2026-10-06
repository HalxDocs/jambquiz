package content

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/274lab/server/pkg/ids"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound = errors.New("not found")
	ErrBadInput = errors.New("invalid input")
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

type Question struct {
	ID               string   `json:"id"`
	Subject          string   `json:"subject"`
	Week             string   `json:"week"`
	Question         string   `json:"question"`
	Options          []string `json:"options"`
	Explanation      string   `json:"explanation,omitempty"`
	Image            string   `json:"image,omitempty"`
	OptionImages     []string `json:"optionImages,omitempty"`
	ExplanationImage string   `json:"explanationImage,omitempty"`
	VideoURL         string   `json:"videoUrl,omitempty"`
	Answer           *int     `json:"answer,omitempty"`
}

// List returns public questions (no answer key).
func (s *Service) List(ctx context.Context, subject, week string) ([]Question, error) {
	out := []Question{}
	q := `SELECT id, subject, week, question, options, explanation, image, option_images, explanation_image, video_url
		FROM questions WHERE ($1='' OR subject=$1) AND ($2='' OR week=$2) ORDER BY id LIMIT 500`
	rows, err := s.pool.Query(ctx, q, subject, week)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var qu Question
		var options, optImgs []byte
		if err := rows.Scan(&qu.ID, &qu.Subject, &qu.Week, &qu.Question, &options,
			&qu.Explanation, &qu.Image, &optImgs, &qu.ExplanationImage, &qu.VideoURL); err == nil {
			_ = json.Unmarshal(options, &qu.Options)
			_ = json.Unmarshal(optImgs, &qu.OptionImages)
			out = append(out, qu)
		}
	}
	return out, nil
}

// ListWithAnswers is admin-only (includes the key).
func (s *Service) ListWithAnswers(ctx context.Context, subject, week string) ([]Question, error) {
	out, err := s.List(ctx, subject, week)
	if err != nil {
		return out, err
	}
	for i := range out {
		var ans int
		if err := s.pool.QueryRow(ctx, `SELECT answer FROM question_answers WHERE question_id=$1`,
			out[i].ID).Scan(&ans); err == nil {
			a := ans
			out[i].Answer = &a
		}
	}
	return out, nil
}

type QuestionInput struct {
	Subject          string   `json:"subject"`
	Week             string   `json:"week"`
	Question         string   `json:"question"`
	Options          []string `json:"options"`
	Explanation      string   `json:"explanation"`
	Image            string   `json:"image"`
	OptionImages     []string `json:"optionImages"`
	ExplanationImage string   `json:"explanationImage"`
	VideoURL         string   `json:"videoUrl"`
	Answer           *int     `json:"answer"`
}

func (in QuestionInput) validate() error {
	if strings.TrimSpace(in.Subject) == "" || strings.TrimSpace(in.Week) == "" {
		return ErrBadInput
	}
	if len(in.Question) == 0 || len(in.Question) > 2000 {
		return ErrBadInput
	}
	if len(in.Options) != 4 {
		return ErrBadInput
	}
	if in.Answer == nil || *in.Answer < 0 || *in.Answer > 3 {
		return ErrBadInput
	}
	return nil
}

func (s *Service) Create(ctx context.Context, in QuestionInput) (string, error) {
	if err := in.validate(); err != nil {
		return "", err
	}
	id := ids.New()
	optJSON, _ := json.Marshal(in.Options)
	optImg := in.OptionImages
	if optImg == nil {
		optImg = []string{"", "", "", ""}
	}
	optImgJSON, _ := json.Marshal(optImg)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `INSERT INTO questions
		(id, subject, week, question, options, explanation, image, option_images, explanation_image, video_url)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		id, in.Subject, in.Week, in.Question, optJSON, in.Explanation, in.Image, optImgJSON,
		in.ExplanationImage, in.VideoURL); err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO question_answers (question_id, answer) VALUES ($1,$2)`,
		id, *in.Answer); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return id, nil
}

func (s *Service) Update(ctx context.Context, id string, in QuestionInput) error {
	if err := in.validate(); err != nil {
		return err
	}
	optJSON, _ := json.Marshal(in.Options)
	optImg := in.OptionImages
	if optImg == nil {
		optImg = []string{"", "", "", ""}
	}
	optImgJSON, _ := json.Marshal(optImg)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	res, err := tx.Exec(ctx, `UPDATE questions SET subject=$1, week=$2, question=$3, options=$4,
		explanation=$5, image=$6, option_images=$7, explanation_image=$8, video_url=$9, updated_at=now() WHERE id=$10`,
		in.Subject, in.Week, in.Question, optJSON, in.Explanation, in.Image, optImgJSON,
		in.ExplanationImage, in.VideoURL, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	if _, err := tx.Exec(ctx, `INSERT INTO question_answers (question_id, answer) VALUES ($1,$2)
		ON CONFLICT (question_id) DO UPDATE SET answer=$2`, id, *in.Answer); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) Delete(ctx context.Context, id string) error {
	res, err := s.pool.Exec(ctx, `DELETE FROM questions WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Copy duplicates a week's bank (questions + keys) into another week.
func (s *Service) Copy(ctx context.Context, subject, fromWeek, toWeek string) (int, error) {
	if fromWeek == "" || toWeek == "" || fromWeek == toWeek {
		return 0, ErrBadInput
	}
	src, err := s.ListWithAnswers(ctx, subject, fromWeek)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, q := range src {
		in := QuestionInput{Subject: q.Subject, Week: toWeek, Question: q.Question,
			Options: q.Options, Explanation: q.Explanation, Image: q.Image,
			OptionImages: q.OptionImages, ExplanationImage: q.ExplanationImage,
			VideoURL: q.VideoURL, Answer: q.Answer}
		if in.Answer == nil {
			z := -1
			in.Answer = &z
		}
		if *in.Answer < 0 {
			continue
		}
		if _, err := s.Create(ctx, in); err == nil {
			n++
		}
	}
	return n, nil
}

// Limits.

func (s *Service) GetLimit(ctx context.Context, subject, week string) int {
	def := 25
	if subject == "English Language" {
		def = 40
	}
	var lim int
	if err := s.pool.QueryRow(ctx, `SELECT "limit" FROM question_limits WHERE subject=$1 AND week=$2`,
		subject, week).Scan(&lim); err != nil || lim < 1 {
		return def
	}
	if lim > 200 {
		return 200
	}
	return lim
}

func (s *Service) SaveLimit(ctx context.Context, subject, week string, limit int) error {
	if subject == "" || week == "" || limit < 1 || limit > 200 {
		return ErrBadInput
	}
	id := strings.ReplaceAll(subject, " ", "_") + "__" + strings.ReplaceAll(week, " ", "_")
	_, err := s.pool.Exec(ctx, `INSERT INTO question_limits (id, subject, week, "limit")
		VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET "limit"=$4`,
		id, subject, week, limit)
	return err
}

// Topics.

func (s *Service) GetTopics(ctx context.Context, week string) map[string]any {
	var raw []byte
	if err := s.pool.QueryRow(ctx, `SELECT topics FROM topics WHERE week=$1`, week).Scan(&raw); err != nil {
		return map[string]any{}
	}
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	if out == nil {
		return map[string]any{}
	}
	return out
}

func (s *Service) SaveTopics(ctx context.Context, week string, topics map[string]any) error {
	if week == "" {
		return ErrBadInput
	}
	if len(topics) > 11 {
		return ErrBadInput
	}
	raw, _ := json.Marshal(topics)
	_, err := s.pool.Exec(ctx, `INSERT INTO topics (week, topics, updated_at)
		VALUES ($1,$2,now()) ON CONFLICT (week) DO UPDATE SET topics=$2, updated_at=now()`, week, raw)
	return err
}

// Settings.

func (s *Service) GetSetting(ctx context.Context, key string) map[string]any {
	var raw []byte
	if err := s.pool.QueryRow(ctx, `SELECT data FROM settings WHERE key=$1`, key).Scan(&raw); err != nil {
		return map[string]any{}
	}
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	if out == nil {
		return map[string]any{}
	}
	return out
}

func (s *Service) ActiveWeek(ctx context.Context) string {
	d := s.GetSetting(ctx, "activeWeek")
	if v, ok := d["value"].(string); ok && v != "" {
		return v
	}
	return "Week 1"
}

func (s *Service) SetActiveWeek(ctx context.Context, week, source string) error {
	if week == "" {
		return ErrBadInput
	}
	if source == "" {
		source = "manual"
	}
	raw, _ := json.Marshal(map[string]any{"key": "activeWeek", "value": week, "source": source})
	_, err := s.pool.Exec(ctx, `INSERT INTO settings (key, data, updated_at)
		VALUES ('activeWeek',$1,now()) ON CONFLICT (key) DO UPDATE SET data=$1, updated_at=now()`, raw)
	return err
}

func (s *Service) SetQuizDates(ctx context.Context, week, date1, date2 string) error {
	if week == "" {
		return ErrBadInput
	}
	id := "quizDates_" + sanitizeKey(week)
	raw, _ := json.Marshal(map[string]any{"key": "quizDates_" + week, "date1": date1, "date2": date2})
	_, err := s.pool.Exec(ctx, `INSERT INTO settings (key, data, updated_at)
		VALUES ($1,$2,now()) ON CONFLICT (key) DO UPDATE SET data=$2, updated_at=now()`, id, raw)
	return err
}

func sanitizeKey(week string) string {
	out := []byte{}
	for i := 0; i < len(week) && len(out) < 50; i++ {
		c := week[i]
		if c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_' {
			out = append(out, c)
		} else {
			out = append(out, '_')
		}
	}
	return string(out)
}
