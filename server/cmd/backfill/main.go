// Command backfill imports Firestore collections into Postgres.
// IDs are preserved 1:1 (both are opaque strings).
//
// Usage:
//
//	go run ./cmd/backfill --creds /path/service-account.json \
//	  --project fitness-gym-fc040 \
//	  --db "postgres://user:pass@host:5432/jambquiz?sslmode=require"
//
// Flags:
//
//	--dry-run   read + count everything, write nothing
//	--only      comma list of steps to run (default: all)
//	--skip-auth-users skip Firebase Auth user enumeration (roles)
//
// Afterwards: passwords cannot migrate (Firebase Auth hashes are
// Google-held). Accounts get password_hash=” and must reset via the
// recovery-code flow. Admin/teacher roles come from Auth custom claims.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	credsPath = flag.String("creds", "", "service account JSON path")
	project   = flag.String("project", "", "firebase project id")
	dbURL     = flag.String("db", os.Getenv("DATABASE_URL"), "postgres DSN")
	dryRun    = flag.Bool("dry-run", false, "count only, write nothing")
	only      = flag.String("only", "", "comma-separated steps to run")
	skipAuth  = flag.Bool("skip-auth-users", false, "skip Auth custom-claim roles")
)

type counts map[string]int

func (c counts) add(step string, n int) { c[step] += n }

func str(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func strSlice(m map[string]any, key string) []string {
	v, ok := m[key].([]any)
	if !ok {
		return []string{}
	}
	out := []string{}
	for _, e := range v {
		if s, ok := e.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func num(m map[string]any, key string) int {
	switch v := m[key].(type) {
	case int64:
		return int(v)
	case float64:
		return int(v)
	case int:
		return v
	}
	return 0
}

func boolean(m map[string]any, key string) bool {
	if v, ok := m[key].(bool); ok {
		return v
	}
	return false
}

func ts(m map[string]any, key string) *time.Time {
	v, ok := m[key]
	if !ok || v == nil {
		return nil
	}
	switch t := v.(type) {
	case time.Time:
		u := t.UTC()
		return &u
	case string:
		if parsed, err := time.Parse(time.RFC3339, t); err == nil {
			u := parsed.UTC()
			return &u
		}
		return nil
	}
	return nil
}

func jsonField(v any) []byte {
	if v == nil {
		return []byte("null")
	}
	raw, err := json.Marshal(v)
	if err != nil {
		return []byte("null")
	}
	return raw
}

func allDocs(ctx context.Context, fs *firestore.Client, col string) ([]*firestore.DocumentSnapshot, error) {
	var lastErr error
	for attempt := 0; attempt < 5; attempt++ {
		if attempt > 0 {
			wait := time.Duration(2<<attempt) * time.Second
			log.Printf("%s: read error (%v), retrying in %s", col, lastErr, wait)
			time.Sleep(wait)
		}
		var out []*firestore.DocumentSnapshot
		it := fs.Collection(col).Documents(ctx)
		failed := false
		for {
			doc, err := it.Next()
			if err == iterator.Done {
				break
			}
			if err != nil {
				lastErr = err
				failed = true
				break
			}
			out = append(out, doc)
		}
		it.Stop()
		if !failed {
			return out, nil
		}
	}
	return nil, fmt.Errorf("%s: %v", col, lastErr)
}

func wanted(step string) bool {
	if *only == "" {
		return true
	}
	for _, s := range strings.Split(*only, ",") {
		if strings.TrimSpace(s) == step {
			return true
		}
	}
	return false
}

func main() {
	flag.Parse()
	if *credsPath == "" || *project == "" || *dbURL == "" {
		log.Fatal("need --creds, --project, --db")
	}
	ctx := context.Background()
	opt := option.WithCredentialsFile(*credsPath)
	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: *project}, opt)
	if err != nil {
		log.Fatalf("firebase app: %v", err)
	}
	fs, err := app.Firestore(ctx)
	if err != nil {
		log.Fatalf("firestore: %v", err)
	}
	defer fs.Close()
	pool, err := pgxpool.New(ctx, *dbURL)
	if err != nil {
		log.Fatalf("pg: %v", err)
	}
	defer pool.Close()

	c := counts{}
	if wanted("students") {
		c.add("students", importStudents(ctx, fs, pool))
	}
	if wanted("teachers") {
		c.add("teachers", importTeachers(ctx, fs, pool))
	}
	if wanted("questions") {
		c.add("questions", importQuestions(ctx, fs, pool))
	}
	if wanted("topics-settings") {
		c.add("topics-settings", importTopicsSettings(ctx, fs, pool))
	}
	if wanted("scores") {
		c.add("scores", importScores(ctx, fs, pool))
	}
	if wanted("payments") {
		c.add("payments", importPayments(ctx, fs, pool))
	}
	if wanted("coins") {
		c.add("coins", importCoins(ctx, fs, pool))
	}
	if wanted("push") {
		c.add("push", importPush(ctx, fs, pool))
	}
	if wanted("misc") {
		c.add("misc", importMisc(ctx, fs, pool))
	}
	if wanted("roles") && !*skipAuth {
		c.add("roles", importRoles(ctx, app, pool))
	}
	if wanted("counter") {
		c.add("counter", importCounter(ctx, fs, pool))
	}

	keys := []string{}
	for k := range c {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	total := 0
	for _, k := range keys {
		fmt.Printf("%-16s %d\n", k, c[k])
		total += c[k]
	}
	fmt.Printf("%-16s %d%s\n", "TOTAL", total, map[bool]string{true: " (dry run)", false: ""}[*dryRun])
}

func execAll(ctx context.Context, pool *pgxpool.Pool, sql string, rows [][]any) (int, error) {
	if *dryRun {
		return len(rows), nil
	}
	if len(rows) == 0 {
		return 0, nil
	}
	batch := &pgx.Batch{}
	for _, r := range rows {
		batch.Queue(sql, r...)
	}
	br := pool.SendBatch(ctx, batch)
	failed := false
	for range rows {
		if _, err := br.Exec(); err != nil {
			failed = true
			break
		}
	}
	br.Close()
	if !failed {
		return len(rows), nil
	}
	// Fall back to row-by-row so orphans (e.g. scores keyed by deleted
	// student IDs) are skipped instead of aborting the batch.
	ok, skipped := 0, 0
	for i, r := range rows {
		if _, err := pool.Exec(ctx, sql, r...); err != nil {
			skipped++
			if skipped <= 3 {
				log.Printf("skip row %d: %v", i, err)
			}
			continue
		}
		ok++
	}
	if skipped > 0 {
		log.Printf("skipped %d orphan rows", skipped)
	}
	return ok, nil
}

func importStudents(ctx context.Context, fs *firestore.Client, pool *pgxpool.Pool) int {
	docs, err := allDocs(ctx, fs, "students")
	if err != nil {
		log.Fatalf("students: %v", err)
	}
	rows := [][]any{}
	profiles := [][]any{}
	for _, d := range docs {
		m := d.Data()
		words := strSlice(m, "nameLowerWords")
		if len(words) == 0 && str(m, "name") != "" {
			words = strings.Fields(strings.ToLower(str(m, "name")))
		}
		rows = append(rows, []any{
			d.Ref.ID, str(m, "uid"), "", str(m, "name"), str(m, "nameLower"),
			words, str(m, "nickname"), str(m, "nicknameLower"), str(m, "year"),
			str(m, "email"), str(m, "phone"), str(m, "parentPhone"), str(m, "teacherPhone"),
			strSlice(m, "subjects"), strSlice(m, "squad"), str(m, "referredBy"), str(m, "referralNo"),
			"student", ts(m, "subscriptionUntil"), num(m, "freeAttemptsUsed"),
			ts(m, "trialStartedAt"), ts(m, "joinedAt"), boolean(m, "suspended"),
			num(m, "missedStreak"), str(m, "recoveryCode"), num(m, "coins"),
		})
		profiles = append(profiles, []any{
			d.Ref.ID, str(m, "name"), str(m, "nickname"), words,
			str(m, "nicknameLower"), str(m, "year"),
		})
	}
	n1, err := execAll(ctx, pool, `INSERT INTO students
		(id, uid, password_hash, name, name_lower, name_lower_words, nickname, nickname_lower, year,
		 email, phone, parent_phone, teacher_phone, subjects, squad, referred_by, referral_no,
		 role, subscription_until, free_attempts_used, trial_started_at, joined_at, suspended,
		 missed_streak, recovery_code, coins)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
			NULLIF($25,''),$26)
		ON CONFLICT (id) DO NOTHING`, rows)
	if err != nil {
		log.Fatalf("students insert: %v", err)
	}
	n2, err := execAll(ctx, pool, `INSERT INTO student_profiles
		(student_id, name, nickname, name_lower_words, nickname_lower, year)
		VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (student_id) DO NOTHING`, profiles)
	if err != nil {
		log.Fatalf("profiles insert: %v", err)
	}
	_ = n2
	return n1
}

func importTeachers(ctx context.Context, fs *firestore.Client, pool *pgxpool.Pool) int {
	docs, err := allDocs(ctx, fs, "teachers")
	if err != nil {
		log.Fatalf("teachers: %v", err)
	}
	rows := [][]any{}
	codes := [][]any{}
	for _, d := range docs {
		m := d.Data()
		rows = append(rows, []any{
			d.Ref.ID, str(m, "uid"), "", str(m, "name"), str(m, "email"), str(m, "phone"),
			str(m, "accountNumber"), str(m, "bankName"), str(m, "accountName"), str(m, "bankCode"),
			boolean(m, "bankVerified"), ts(m, "bankVerifiedAt"), boolean(m, "isPioneer"),
			str(m, "pioneerCode"), ts(m, "pioneerSince"),
			ts(m, "phoneUpdatedAt"), ts(m, "createdAt"),
		})
		if code := str(m, "pioneerCode"); code != "" {
			codes = append(codes, []any{code, d.Ref.ID, ts(m, "pioneerSince")})
		}
	}
	n, err := execAll(ctx, pool, `INSERT INTO teachers
		(id, uid, password_hash, name, email, phone, account_number, bank_name, account_name, bank_code,
		 bank_verified, bank_verified_at, is_pioneer, pioneer_code, pioneer_since,
		 phone_updated_at, created_at)
		VALUES ($1,$2,$3,$4,NULLIF($5,''),$6,$7,$8,$9,$10,$11,$12,$13,NULLIF($14,''),$15,$16,COALESCE($17,now()))
		ON CONFLICT (id) DO NOTHING`, rows)
	if err != nil {
		log.Fatalf("teachers insert: %v", err)
	}
	// Second pass: pioneer links (the referenced pioneer may sort after us).
	linkRows := [][]any{}
	for _, d := range docs {
		if pid := str(d.Data(), "referredByPioneerId"); pid != "" {
			linkRows = append(linkRows, []any{d.Ref.ID, pid})
		}
	}
	if _, err := execAll(ctx, pool, `UPDATE teachers SET referred_by_pioneer_id=$2, updated_at=now()
		WHERE id=$1 AND EXISTS(SELECT 1 FROM teachers WHERE id=$2)`, linkRows); err != nil {
		log.Fatalf("teacher links: %v", err)
	}
	n2, err := execAll(ctx, pool, `INSERT INTO pioneer_codes (code, teacher_id, created_at)
		VALUES ($1,$2,COALESCE($3,now())) ON CONFLICT (code) DO NOTHING`, codes)
	if err != nil {
		log.Fatalf("pioneer insert: %v", err)
	}
	return n + n2
}

func importQuestions(ctx context.Context, fs *firestore.Client, pool *pgxpool.Pool) int {
	docs, err := allDocs(ctx, fs, "questions")
	if err != nil {
		log.Fatalf("questions: %v", err)
	}
	ansDocs, err := allDocs(ctx, fs, "questionAnswers")
	if err != nil {
		log.Fatalf("questionAnswers: %v", err)
	}
	keyByQ := map[string]int{}
	for _, d := range ansDocs {
		keyByQ[d.Ref.ID] = num(d.Data(), "answer")
	}
	rows := [][]any{}
	keys := [][]any{}
	for _, d := range docs {
		m := d.Data()
		opts, _ := json.Marshal(m["options"])
		if string(opts) == "null" {
			opts = []byte("[]")
		}
		oimgs, _ := json.Marshal(m["optionImages"])
		if string(oimgs) == "null" {
			oimgs = []byte("[]")
		}
		rows = append(rows, []any{
			d.Ref.ID, str(m, "subject"), str(m, "week"), str(m, "question"), opts,
			str(m, "explanation"), str(m, "image"), oimgs, str(m, "explanationImage"), str(m, "videoUrl"),
		})
		if a, ok := keyByQ[d.Ref.ID]; ok {
			keys = append(keys, []any{d.Ref.ID, a})
		} else if a, ok := m["answer"].(int64); ok {
			keys = append(keys, []any{d.Ref.ID, int(a)})
		} else if a, ok := m["answer"].(float64); ok {
			keys = append(keys, []any{d.Ref.ID, int(a)})
		}
	}
	n1, err := execAll(ctx, pool, `INSERT INTO questions
		(id, subject, week, question, options, explanation, image, option_images, explanation_image, video_url)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`, rows)
	if err != nil {
		log.Fatalf("questions insert: %v", err)
	}
	n2, err := execAll(ctx, pool, `INSERT INTO question_answers (question_id, answer)
		VALUES ($1,$2) ON CONFLICT (question_id) DO NOTHING`, keys)
	if err != nil {
		log.Fatalf("answers insert: %v", err)
	}
	return n1 + n2
}

func importTopicsSettings(ctx context.Context, fs *firestore.Client, pool *pgxpool.Pool) int {
	n := 0
	docs, err := allDocs(ctx, fs, "topics")
	if err != nil {
		log.Fatalf("topics: %v", err)
	}
	rows := [][]any{}
	for _, d := range docs {
		m := d.Data()
		rows = append(rows, []any{str(m, "week"), jsonField(m["topics"])})
	}
	n1, err := execAll(ctx, pool, `INSERT INTO topics (week, topics) VALUES ($1,$2)
		ON CONFLICT (week) DO UPDATE SET topics=$2`, rows)
	if err != nil {
		log.Fatalf("topics insert: %v", err)
	}
	n += n1

	sdocs, err := allDocs(ctx, fs, "settings")
	if err != nil {
		log.Fatalf("settings: %v", err)
	}
	srows := [][]any{}
	for _, d := range sdocs {
		raw, _ := json.Marshal(d.Data())
		srows = append(srows, []any{d.Ref.ID, raw})
	}
	n2, err := execAll(ctx, pool, `INSERT INTO settings (key, data) VALUES ($1,$2)
		ON CONFLICT (key) DO UPDATE SET data=$2`, srows)
	if err != nil {
		log.Fatalf("settings insert: %v", err)
	}
	n += n2

	ldocs, err := allDocs(ctx, fs, "question_limits")
	if err == nil {
		lrows := [][]any{}
		for _, d := range ldocs {
			m := d.Data()
			lrows = append(lrows, []any{d.Ref.ID, str(m, "subject"), str(m, "week"), num(m, "limit")})
		}
		n3, err := execAll(ctx, pool, `INSERT INTO question_limits (id, subject, week, "limit")
			VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET "limit"=$4`, lrows)
		if err != nil {
			log.Fatalf("limits insert: %v", err)
		}
		n += n3
	}
	return n
}

func importScores(ctx context.Context, fs *firestore.Client, pool *pgxpool.Pool) int {
	docs, err := allDocs(ctx, fs, "scores")
	if err != nil {
		log.Fatalf("scores: %v", err)
	}
	rows := [][]any{}
	for _, d := range docs {
		m := d.Data()
		outOf := num(m, "outOf")
		if outOf == 0 {
			outOf = num(m, "outOf")
		}
		if outOf == 0 {
			outOf = 100
		}
		rows = append(rows, []any{
			d.Ref.ID, str(m, "studentId"), str(m, "uid"), str(m, "studentName"),
			str(m, "subject"), str(m, "week"), num(m, "score"), outOf, num(m, "correct"),
			num(m, "wrong"), num(m, "unanswered"), num(m, "total"), boolean(m, "isRetake"),
			ts(m, "date"),
		})
	}
	n1, err := execAll(ctx, pool, `INSERT INTO scores
		(id, student_id, uid, student_name, subject, week, score, out_of, correct, wrong,
		 unanswered, total, is_retake, date)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14,now()))
		ON CONFLICT (id) DO NOTHING`, rows)
	if err != nil {
		log.Fatalf("scores insert: %v", err)
	}

	ddocs, err := allDocs(ctx, fs, "scoreDetails")
	if err != nil {
		log.Fatalf("scoreDetails: %v", err)
	}
	drows := [][]any{}
	for _, d := range ddocs {
		m := d.Data()
		drows = append(drows, []any{
			d.Ref.ID, str(m, "studentId"), str(m, "uid"), str(m, "week"),
			jsonField(m["subjects"]), jsonField(m["answers"]),
		})
	}
	n2, err := execAll(ctx, pool, `INSERT INTO score_details
		(id, student_id, uid, week, subjects, answers)
		VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`, drows)
	if err != nil {
		log.Fatalf("details insert: %v", err)
	}
	return n1 + n2
}

func importPayments(ctx context.Context, fs *firestore.Client, pool *pgxpool.Pool) int {
	docs, err := allDocs(ctx, fs, "payments")
	if err != nil {
		log.Fatalf("payments: %v", err)
	}
	rows := [][]any{}
	for _, d := range docs {
		m := d.Data()
		var coinsVal *int
		if str(m, "type") == "coin_purchase" {
			c := num(m, "coins")
			coinsVal = &c
		}
		rows = append(rows, []any{
			d.Ref.ID, str(m, "studentId"), str(m, "uid"), str(m, "studentName"), str(m, "email"),
			num(m, "amount"), str(m, "currency"), str(m, "method"), str(m, "reference"),
			str(m, "checkoutId"), str(m, "type"), coinsVal, str(m, "extendsTo"), ts(m, "paidAt"),
		})
	}
	n1, err := execAll(ctx, pool, `INSERT INTO payments
		(id, student_id, uid, student_name, email, amount, currency, method, reference, checkout_id,
		 type, coins, extends_to, paid_at)
		VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,''),
		 NULLIF($8,''),$9,$10,$11,$12,
		 CASE WHEN $13='' THEN NULL ELSE ($13::timestamptz) END,
		 COALESCE($14,now()))
		ON CONFLICT (id) DO NOTHING`, rows)
	if err != nil {
		log.Fatalf("payments insert: %v", err)
	}

	n := n1
	pc, err := allDocs(ctx, fs, "paystackCheckouts")
	if err == nil {
		prows := [][]any{}
		for _, d := range pc {
			m := d.Data()
			prows = append(prows, []any{
				d.Ref.ID, str(m, "studentId"), str(m, "type"), str(m, "status"),
				str(m, "accessCode"), str(m, "packId"), num(m, "coins"), num(m, "priceNgn"),
			})
		}
		n2, err := execAll(ctx, pool, `INSERT INTO paystack_checkouts
			(reference, student_id, type, status, access_code, pack_id, coins, price_ngn)
			VALUES ($1,$2,NULLIF($3,''),$4,NULLIF($5,''),NULLIF($6,''),$7,$8)
			ON CONFLICT (reference) DO NOTHING`, prows)
		if err != nil {
			log.Fatalf("paystack insert: %v", err)
		}
		n += n2
	}
	bc, err := allDocs(ctx, fs, "bachsCheckouts")
	if err == nil {
		brows := [][]any{}
		for _, d := range bc {
			m := d.Data()
			brows = append(brows, []any{d.Ref.ID, str(m, "studentId"), str(m, "type"), str(m, "status")})
		}
		n3, err := execAll(ctx, pool, `INSERT INTO bachs_checkouts (id, student_id, type, status)
			VALUES ($1,$2,NULLIF($3,''),$4) ON CONFLICT (id) DO NOTHING`, brows)
		if err != nil {
			log.Fatalf("bachs insert: %v", err)
		}
		n += n3
	}
	return n
}

func importCoins(ctx context.Context, fs *firestore.Client, pool *pgxpool.Pool) int {
	n := 0
	docs, err := allDocs(ctx, fs, "coinLedger")
	if err == nil {
		rows := [][]any{}
		for _, d := range docs {
			m := d.Data()
			rows = append(rows, []any{
				d.Ref.ID, str(m, "studentId"), str(m, "uid"), num(m, "delta"),
				str(m, "reason"), str(m, "ref"),
			})
		}
		n1, err := execAll(ctx, pool, `INSERT INTO coin_ledger (id, student_id, uid, delta, reason, ref)
			VALUES ($1,$2,$3,$4,NULLIF($5,''),NULLIF($6,'')) ON CONFLICT (id) DO NOTHING`, rows)
		if err != nil {
			log.Fatalf("ledger insert: %v", err)
		}
		n += n1
	}
	pdocs, err := allDocs(ctx, fs, "coinPacks")
	if err == nil {
		prows := [][]any{}
		for _, d := range pdocs {
			m := d.Data()
			prows = append(prows, []any{d.Ref.ID, num(m, "coins"), num(m, "priceNgn")})
		}
		n2, err := execAll(ctx, pool, `INSERT INTO coin_packs (id, coins, price_ngn)
			VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET coins=$2, price_ngn=$3`, prows)
		if err != nil {
			log.Fatalf("packs insert: %v", err)
		}
		n += n2
	}
	gdocs, err := allDocs(ctx, fs, "goats")
	if err == nil {
		grows := [][]any{}
		for _, d := range gdocs {
			m := d.Data()
			grows = append(grows, []any{
				d.Ref.ID, str(m, "name"), str(m, "profession"),
				jsonField(m["stars"]), jsonField(m["explanations"]),
			})
		}
		n3, err := execAll(ctx, pool, `INSERT INTO goats (id, name, profession, stars, explanations)
			VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET name=$2, profession=$3, stars=$4, explanations=$5`, grows)
		if err != nil {
			log.Fatalf("goats insert: %v", err)
		}
		n += n3
	}
	wdocs, err := allDocs(ctx, fs, "goatWeeks")
	if err == nil {
		wrows := [][]any{}
		for _, d := range wdocs {
			m := d.Data()
			ids := []string{}
			for _, g := range strSlice(m, "goatIds") {
				ids = append(ids, g)
			}
			wrows = append(wrows, []any{d.Ref.ID, ids})
		}
		n4, err := execAll(ctx, pool, `INSERT INTO goat_weeks (week, goat_ids) VALUES ($1,$2)
			ON CONFLICT (week) DO UPDATE SET goat_ids=$2`, wrows)
		if err != nil {
			log.Fatalf("goatWeeks insert: %v", err)
		}
		n += n4
	}
	return n
}

func importPush(ctx context.Context, fs *firestore.Client, pool *pgxpool.Pool) int {
	n := 0
	docs, err := allDocs(ctx, fs, "push_subscriptions")
	if err == nil {
		rows := [][]any{}
		for _, d := range docs {
			m := d.Data()
			rows = append(rows, []any{d.Ref.ID, str(m, "endpoint"), jsonField(m["keys"])})
		}
		n1, err := execAll(ctx, pool, `INSERT INTO push_subscriptions (student_id, endpoint, keys)
			VALUES ($1,$2,$3) ON CONFLICT (student_id) DO UPDATE SET endpoint=$2, keys=$3`, rows)
		if err != nil {
			log.Fatalf("push insert: %v", err)
		}
		n += n1
	}
	sdocs, err := allDocs(ctx, fs, "notification_state")
	if err == nil {
		srows := [][]any{}
		for _, d := range sdocs {
			m := d.Data()
			srows = append(srows, []any{
				d.Ref.ID, jsonField(orEmptyMap(m["seenPoints"])), num(m, "currentCycleIndex"),
				boolean(m, "patchesActive"), strSlice(m, "selectedPatchSubjects"),
			})
		}
		n2, err := execAll(ctx, pool, `INSERT INTO notification_state
			(student_id, seen_points, current_cycle_index, patches_active, selected_patch_subjects)
			VALUES ($1,$2,$3,$4,$5)
			ON CONFLICT (student_id) DO UPDATE SET seen_points=$2, current_cycle_index=$3,
			patches_active=$4, selected_patch_subjects=$5`, srows)
		if err != nil {
			log.Fatalf("notify state insert: %v", err)
		}
		n += n2
	}
	return n
}

func orEmptyMap(v any) any {
	if v == nil {
		return map[string]any{}
	}
	return v
}

func importMisc(ctx context.Context, fs *firestore.Client, pool *pgxpool.Pool) int {
	n := 0
	for _, job := range []struct {
		col string
		sql string
		fn  func(m map[string]any) []any
	}{
		{"admin_broadcasts",
			`INSERT INTO admin_broadcasts (id, title, message, target) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
			func(m map[string]any) []any {
				return []any{"", str(m, "title"), str(m, "message"), str(m, "target")}
			}},
		{"guestbook",
			`INSERT INTO guestbook (id, name, message, signature, ip) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
			func(m map[string]any) []any {
				return []any{"", str(m, "name"), str(m, "message"), str(m, "signature"), str(m, "ip")}
			}},
	} {
		docs, err := allDocs(ctx, fs, job.col)
		if err != nil {
			continue
		}
		rows := [][]any{}
		for _, d := range docs {
			r := job.fn(d.Data())
			r[0] = d.Ref.ID
			rows = append(rows, r)
		}
		n1, err := execAll(ctx, pool, job.sql, rows)
		if err != nil {
			log.Fatalf("%s insert: %v", job.col, err)
		}
		n += n1
	}
	adocs, err := allDocs(ctx, fs, "admin_settings")
	if err == nil {
		arows := [][]any{}
		for _, d := range adocs {
			raw, _ := json.Marshal(d.Data())
			arows = append(arows, []any{d.Ref.ID, raw})
		}
		n2, err := execAll(ctx, pool, `INSERT INTO admin_settings (id, data) VALUES ($1,$2)
			ON CONFLICT (id) DO NOTHING`, arows)
		if err != nil {
			log.Fatalf("admin_settings insert: %v", err)
		}
		n += n2
	}
	return n
}

func importRoles(ctx context.Context, app *firebase.App, pool *pgxpool.Pool) int {
	authClient, err := app.Auth(ctx)
	if err != nil {
		log.Fatalf("auth: %v", err)
	}
	it := authClient.Users(ctx, "")
	n := 0
	for {
		u, err := it.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			log.Fatalf("users: %v", err)
		}
		if _, ok := u.CustomClaims["admin"]; ok {
			if *dryRun {
				n++
				continue
			}
			res, err := pool.Exec(ctx, `UPDATE students SET role='admin', updated_at=now() WHERE uid=$1`, u.UID)
			if err != nil {
				log.Fatalf("role: %v", err)
			}
			n += int(res.RowsAffected())
		}
	}
	return n
}

type authClient interface{}

func importCounter(ctx context.Context, fs *firestore.Client, pool *pgxpool.Pool) int {
	docs, err := allDocs(ctx, fs, "counters")
	if err != nil {
		return 0
	}
	next := 1
	for _, d := range docs {
		if n := num(d.Data(), "next"); n > next {
			next = n
		}
	}
	if *dryRun {
		return 1
	}
	_, err = pool.Exec(ctx, `INSERT INTO admin_settings (id, data) VALUES ('counter_referrals',$1)
		ON CONFLICT (id) DO UPDATE SET data = CASE
			WHEN (admin_settings.data->>'next')::int < $2 THEN $1 ELSE admin_settings.data END`,
		fmt.Sprintf(`{"next":%d}`, next), next)
	if err != nil {
		log.Fatalf("counter: %v", err)
	}
	return 1
}
