package payments

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/274lab/server/pkg/ids"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	SubscriptionPrice = 800
	ResumePrice       = 800
)

var defaultPacks = []CoinPack{
	{ID: "pack5", Coins: 5, PriceNGN: 250},
	{ID: "pack20", Coins: 20, PriceNGN: 500},
}

var (
	ErrNotFound      = errors.New("not found")
	ErrForbidden     = errors.New("forbidden")
	ErrBadInput      = errors.New("invalid input")
	ErrRateLimited   = errors.New("too many requests, try again later")
	ErrNotConfigured = errors.New("payment gateway not configured")
	ErrNotSuccess    = errors.New("payment not successful yet")
	ErrUnderpaid     = errors.New("underpayment")
	ErrBadCurrency   = errors.New("invalid currency")
	ErrUnauthorized  = errors.New("unauthorized")
)

var paystackRefRe = regexp.MustCompile(`^274L-(SUB|RES|COIN)-[a-zA-Z0-9_-]+-\d+$`)

type Config struct {
	PaystackSecret       string
	PaystackCallbackURL  string
	BachsAPIKey          string
	BachsSubProductID    string
	BachsResumeProductID string
	BachsWebhookToken    string
	BachsWebhookSecret   string
}

type Service struct {
	pool   *pgxpool.Pool
	cfg    Config
	client *http.Client
}

func NewService(pool *pgxpool.Pool, cfg Config) *Service {
	return &Service{pool: pool, cfg: cfg, client: &http.Client{Timeout: 20 * time.Second}}
}

func computeExpiry(current *time.Time, months int) time.Time {
	now := time.Now().UTC()
	anchor := now
	if current != nil && current.After(now) {
		anchor = *current
	}
	return anchor.AddDate(0, months, 0)
}

type Payment struct {
	ID          string  `json:"id,omitempty"`
	StudentID   string  `json:"studentId"`
	StudentName string  `json:"studentName"`
	Email       string  `json:"email"`
	Amount      int     `json:"amount"`
	Currency    string  `json:"currency"`
	Method      string  `json:"method"`
	Reference   string  `json:"reference"`
	CheckoutID  string  `json:"checkoutId"`
	Type        string  `json:"type"`
	Coins       *int    `json:"coins,omitempty"`
	ExtendsTo   *string `json:"extendsTo,omitempty"`
	PaidAt      string  `json:"paidAt"`
}

func (s *Service) student(ctx context.Context, id string) (name, uid, email string, subUntil *time.Time, err error) {
	err = s.pool.QueryRow(ctx, `SELECT name, COALESCE(uid,''), email, subscription_until FROM students WHERE id=$1`, id).Scan(&name, &uid, &email, &subUntil)
	return
}

// --- Paystack ---

type PaystackInit struct {
	AuthorizationURL string `json:"authorization_url"`
	AccessCode       string `json:"access_code"`
	Reference        string `json:"reference"`
}

func (s *Service) CreatePaystack(ctx context.Context, studentID, payType, packID, callbackURL string) (PaystackInit, error) {
	var out PaystackInit
	if s.cfg.PaystackSecret == "" {
		return out, ErrNotConfigured
	}
	if payType != "subscription" && payType != "resume" && payType != "coins" {
		return out, ErrBadInput
	}
	name, _, email, _, err := s.student(ctx, studentID)
	if err != nil {
		return out, ErrNotFound
	}
	amountNGN := SubscriptionPrice
	tag := "SUB"
	packCoins := 0
	if payType == "resume" {
		amountNGN = ResumePrice
		tag = "RES"
	} else if payType == "coins" {
		pack, ok := s.coinPack(ctx, packID)
		if !ok {
			return out, ErrBadInput
		}
		amountNGN = pack.PriceNGN
		packCoins = pack.Coins
		tag = "COIN"
	}
	reference := fmt.Sprintf("274L-%s-%s-%d", tag, studentID, time.Now().UnixMilli())
	if email == "" {
		email = strings.ToLower(strings.ReplaceAll(name, " ", ".")) + "@274lab.app"
	}
	cb := strings.TrimSpace(callbackURL)
	if cb == "" {
		cb = s.cfg.PaystackCallbackURL
	}
	if cb == "" {
		cb = "https://www.274lab.com/"
	}
	if u, err := parseHost(cb); err != nil || !allowedCallbackHost(u) {
		cb = "https://www.274lab.com/"
	}
	body, _ := json.Marshal(map[string]any{
		"email": email, "amount": fmt.Sprint(amountNGN * 100), "reference": reference,
		"currency": "NGN", "callback_url": cb,
		"metadata": map[string]any{"studentId": studentID, "type": payType,
			"studentName": name, "packId": packID, "coins": packCoins},
	})
	req, _ := http.NewRequestWithContext(ctx, "POST", "https://api.paystack.co/transaction/initialize",
		bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+s.cfg.PaystackSecret)
	req.Header.Set("Content-Type", "application/json")
	res, err := s.client.Do(req)
	if err != nil {
		return out, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var decoded struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			AuthorizationURL string `json:"authorization_url"`
			AccessCode       string `json:"access_code"`
			Reference        string `json:"reference"`
		} `json:"data"`
	}
	_ = json.Unmarshal(raw, &decoded)
	if !decoded.Status || decoded.Data.Reference == "" {
		return out, fmt.Errorf("paystack initialize failed: %s", decoded.Message)
	}
	if _, err := s.pool.Exec(ctx, `INSERT INTO paystack_checkouts
		(reference, student_id, type, access_code, pack_id, coins, price_ngn, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING')`,
		decoded.Data.Reference, studentID, payType, decoded.Data.AccessCode,
		nullable(packID), nullableInt(packCoins, payType == "coins"), nullableInt(amountNGN, payType == "coins"),
	); err != nil {
		return out, err
	}
	return PaystackInit{AuthorizationURL: decoded.Data.AuthorizationURL,
		AccessCode: decoded.Data.AccessCode, Reference: decoded.Data.Reference}, nil
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullableInt(n int, ok bool) any {
	if !ok {
		return nil
	}
	return n
}

func parseHost(raw string) (string, error) {
	var host string
	if i := strings.Index(raw, "://"); i >= 0 {
		rest := raw[i+3:]
		if j := strings.Index(rest, "/"); j >= 0 {
			host = rest[:j]
		} else {
			host = rest
		}
		return host, nil
	}
	return "", errors.New("bad url")
}

func allowedCallbackHost(host string) bool {
	switch host {
	case "www.274lab.com", "274lab.com", "fitness-gym-fc040.web.app", "fitness-gym-fc040.firebaseapp.com":
		return true
	}
	return false
}

type CoinPack struct {
	ID       string `json:"id"`
	Coins    int    `json:"coins"`
	PriceNGN int    `json:"priceNgn"`
}

func (s *Service) coinPack(ctx context.Context, id string) (CoinPack, bool) {
	var p CoinPack
	if err := s.pool.QueryRow(ctx, `SELECT id, coins, price_ngn FROM coin_packs WHERE id=$1`, id).Scan(&p.ID, &p.Coins, &p.PriceNGN); err == nil {
		return p, true
	}
	for _, d := range defaultPacks {
		if d.ID == id {
			return d, true
		}
	}
	return p, false
}

// FulfillResult mirrors the Node fulfill return.
type FulfillResult struct {
	AlreadyFulfilled bool     `json:"alreadyFulfilled,omitempty"`
	Payment          *Payment `json:"payment,omitempty"`
}

func (s *Service) CompletePaystack(ctx context.Context, reference string) (FulfillResult, error) {
	if !paystackRefRe.MatchString(reference) {
		return FulfillResult{}, ErrBadInput
	}
	return s.fulfillPaystack(ctx, reference, nil)
}

// CheckoutStudent returns the owning student for pre-fulfillment auth checks.
func (s *Service) CheckoutStudent(ctx context.Context, reference string) (string, error) {
	var studentID string
	if err := s.pool.QueryRow(ctx, `SELECT student_id FROM paystack_checkouts WHERE reference=$1`, reference).Scan(&studentID); err != nil {
		return "", ErrNotFound
	}
	return studentID, nil
}

type paystackVerify struct {
	Status  bool          `json:"status"`
	Message string        `json:"message"`
	Data    *paystackData `json:"data"`
}

type paystackData struct {
	Reference string `json:"reference"`
	Amount    int    `json:"amount"`
	Currency  string `json:"currency"`
	Status    string `json:"status"`
	PaidAt    string `json:"paid_at"`
	Customer  struct {
		Email string `json:"email"`
	} `json:"customer"`
}

func (s *Service) fulfillPaystack(ctx context.Context, reference string, data *paystackData) (FulfillResult, error) {
	var mapStudent, mapType string
	var mapStatus string
	var mapCoins, mapPrice *int
	var mapPack *string
	if err := s.pool.QueryRow(ctx, `SELECT student_id, type, status, coins, price_ngn, pack_id
		FROM paystack_checkouts WHERE reference=$1`, reference,
	).Scan(&mapStudent, &mapType, &mapStatus, &mapCoins, &mapPrice, &mapPack); err != nil {
		return FulfillResult{}, ErrNotFound
	}
	if mapStatus == "FULFILLED" {
		pay, _ := s.paymentByReference(ctx, reference)
		return FulfillResult{AlreadyFulfilled: true, Payment: pay}, nil
	}
	if data == nil {
		if s.cfg.PaystackSecret == "" {
			return FulfillResult{}, ErrNotConfigured
		}
		req, _ := http.NewRequestWithContext(ctx, "GET",
			"https://api.paystack.co/transaction/verify/"+reference, nil)
		req.Header.Set("Authorization", "Bearer "+s.cfg.PaystackSecret)
		res, err := s.client.Do(req)
		if err != nil {
			return FulfillResult{}, err
		}
		defer res.Body.Close()
		raw, _ := io.ReadAll(res.Body)
		var v paystackVerify
		_ = json.Unmarshal(raw, &v)
		if !v.Status || v.Data == nil {
			return FulfillResult{}, fmt.Errorf("paystack verification failed: %s", v.Message)
		}
		data = v.Data
	}
	if data.Status != "success" {
		return FulfillResult{}, ErrNotSuccess
	}
	expected := SubscriptionPrice
	if mapType == "resume" {
		expected = ResumePrice
	} else if mapType == "coins" {
		if mapPrice == nil || *mapPrice <= 0 {
			return FulfillResult{}, ErrBadInput
		}
		expected = *mapPrice
	}
	paidNGN := (data.Amount + 50) / 100
	if data.Currency != "" && data.Currency != "NGN" {
		return FulfillResult{}, ErrBadCurrency
	}
	if paidNGN < expected {
		return FulfillResult{}, fmt.Errorf("%w: expected %d, got %d", ErrUnderpaid, expected, paidNGN)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return FulfillResult{}, err
	}
	defer tx.Rollback(ctx)
	var freshStatus string
	var freshStudent string
	if err := tx.QueryRow(ctx, `SELECT status, student_id FROM paystack_checkouts WHERE reference=$1 FOR UPDATE`,
		reference).Scan(&freshStatus, &freshStudent); err != nil {
		return FulfillResult{}, ErrNotFound
	}
	if freshStatus == "FULFILLED" {
		pay, _ := s.paymentByReference(ctx, reference)
		return FulfillResult{AlreadyFulfilled: true, Payment: pay}, nil
	}
	var stName, stUID, stEmail string
	var stSub *time.Time
	var stCoins int
	if err := tx.QueryRow(ctx, `SELECT name, COALESCE(uid,''), email, subscription_until, coins
		FROM students WHERE id=$1`, freshStudent).Scan(&stName, &stUID, &stEmail, &stSub, &stCoins); err != nil {
		return FulfillResult{}, ErrNotFound
	}

	now := time.Now().UTC()
	pay := &Payment{StudentID: freshStudent, StudentName: stName,
		Email: data.Customer.Email, Amount: paidNGN, Currency: orDefault(data.Currency, "NGN"),
		Method: "paystack", Reference: orDefault(data.Reference, reference),
		CheckoutID: reference, PaidAt: orDefault(data.PaidAt, now.Format(time.RFC3339))}
	if pay.Email == "" {
		pay.Email = stEmail
	}
	payID := ids.New()
	switch mapType {
	case "subscription":
		iso := computeExpiry(stSub, 1)
		isostr := iso.Format(time.RFC3339)
		pay.Type = "subscription"
		pay.ExtendsTo = &isostr
		if _, err := tx.Exec(ctx, `UPDATE students SET subscription_until=$1, updated_at=now() WHERE id=$2`, iso, freshStudent); err != nil {
			return FulfillResult{}, err
		}
		// A paying customer is never left locked: subscription also lifts a
		// red-card suspension (same price as resume, same effect).
		if _, err := tx.Exec(ctx, `UPDATE students SET missed_streak=0, suspended=false, appealed_at=$1,
			updated_at=now() WHERE id=$2 AND suspended=true`, now, freshStudent); err != nil {
			return FulfillResult{}, err
		}
	case "resume":
		pay.Type = "account_resume"
		if _, err := tx.Exec(ctx, `UPDATE students SET missed_streak=0, suspended=false, appealed_at=$1, updated_at=now() WHERE id=$2`, now, freshStudent); err != nil {
			return FulfillResult{}, err
		}
	case "coins":
		coins := 0
		if mapCoins != nil {
			coins = *mapCoins
		}
		if coins <= 0 {
			return FulfillResult{}, ErrBadInput
		}
		pay.Type = "coin_purchase"
		pay.Coins = &coins
		if _, err := tx.Exec(ctx, `UPDATE students SET coins=coins+$1, updated_at=now() WHERE id=$2`, coins, freshStudent); err != nil {
			return FulfillResult{}, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO coin_ledger (id, student_id, uid, delta, reason, ref)
			VALUES ($1,$2,$3,$4,'buy',$5)`, ids.New(), freshStudent, stUID, coins, pay.Reference); err != nil {
			return FulfillResult{}, err
		}
	default:
		return FulfillResult{}, ErrBadInput
	}
	if _, err := tx.Exec(ctx, `INSERT INTO payments
		(id, student_id, uid, student_name, email, amount, currency, method, reference, checkout_id, type, coins, extends_to, paid_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		payID, pay.StudentID, stUID, pay.StudentName, pay.Email, pay.Amount, pay.Currency,
		pay.Method, pay.Reference, pay.CheckoutID, pay.Type, pay.Coins,
		pay.ExtendsTo, parseTimeOrNow(pay.PaidAt)); err != nil {
		return FulfillResult{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE paystack_checkouts SET status='FULFILLED', fulfilled_at=$1 WHERE reference=$2`, now, reference); err != nil {
		return FulfillResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return FulfillResult{}, err
	}
	return FulfillResult{Payment: pay}, nil
}

func (s *Service) paymentByReference(ctx context.Context, reference string) (*Payment, error) {
	var p Payment
	var coins *int
	var extends *time.Time
	var paidAt time.Time
	err := s.pool.QueryRow(ctx, `SELECT student_id, student_name, email, amount, currency, method,
		reference, checkout_id, type, coins, extends_to, paid_at FROM payments WHERE reference=$1 LIMIT 1`, reference,
	).Scan(&p.StudentID, &p.StudentName, &p.Email, &p.Amount, &p.Currency, &p.Method,
		&p.Reference, &p.CheckoutID, &p.Type, &coins, &extends, &paidAt)
	if err != nil {
		return nil, err
	}
	p.Coins = coins
	if extends != nil {
		s := extends.UTC().Format(time.RFC3339)
		p.ExtendsTo = &s
	}
	p.PaidAt = paidAt.UTC().Format(time.RFC3339)
	return &p, nil
}

// PaystackWebhook verifies the HMAC-SHA512 signature and fulfills charge.success.
func (s *Service) PaystackWebhook(ctx context.Context, rawBody []byte, signature string) error {
	if s.cfg.PaystackSecret == "" {
		return ErrNotConfigured
	}
	mac := hmac.New(sha512.New, []byte(s.cfg.PaystackSecret))
	mac.Write(rawBody)
	sig, err := hex.DecodeString(strings.TrimSpace(signature))
	if err != nil || !hmac.Equal(sig, mac.Sum(nil)) {
		return ErrUnauthorized
	}
	var event struct {
		Event string        `json:"event"`
		Data  *paystackData `json:"data"`
	}
	if err := json.Unmarshal(rawBody, &event); err != nil {
		return ErrBadInput
	}
	if event.Event == "charge.success" && event.Data != nil && event.Data.Reference != "" {
		_, err := s.fulfillPaystack(ctx, event.Data.Reference, event.Data)
		return err
	}
	return nil
}

// --- Bachs ---

type BachsInit struct {
	CheckoutURL string `json:"checkout_url"`
	CheckoutID  string `json:"checkout_id"`
}

func (s *Service) CreateBachs(ctx context.Context, studentID, payType, successURL, cancelURL string) (BachsInit, error) {
	var out BachsInit
	if s.cfg.BachsAPIKey == "" {
		return out, ErrNotConfigured
	}
	if payType != "subscription" && payType != "resume" {
		return out, ErrBadInput
	}
	name, _, email, _, err := s.student(ctx, studentID)
	if err != nil {
		return out, ErrNotFound
	}
	productID := s.cfg.BachsSubProductID
	refTag := "SUB"
	if payType == "resume" {
		productID = s.cfg.BachsResumeProductID
		refTag = "RES"
	}
	if productID == "" {
		return out, ErrNotConfigured
	}
	if email == "" {
		email = strings.ToLower(strings.ReplaceAll(name, " ", ".")) + "@274lab.com"
	}
	bodyMap := map[string]any{
		"product_cart": []any{map[string]any{"product_id": productID, "quantity": 1}},
		"customer":     map[string]any{"email": email, "name": name},
		"metadata":     map[string]any{"studentId": studentID, "type": payType},
		"reference":    refTag + "-" + studentID + "-" + fmt.Sprint(time.Now().UnixMilli()),
	}
	if successURL != "" {
		bodyMap["success_url"] = successURL
	}
	if cancelURL != "" {
		bodyMap["cancel_url"] = cancelURL
	}
	body, _ := json.Marshal(bodyMap)
	req, _ := http.NewRequestWithContext(ctx, "POST", "https://api.bachs.io/v1/checkout-sessions", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+s.cfg.BachsAPIKey)
	req.Header.Set("Content-Type", "application/json")
	res, err := s.client.Do(req)
	if err != nil {
		return out, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var decoded struct {
		CheckoutURL string `json:"checkout_url"`
		CheckoutID  string `json:"checkout_id"`
		Detail      string `json:"detail"`
	}
	_ = json.Unmarshal(raw, &decoded)
	if decoded.CheckoutURL == "" {
		return out, fmt.Errorf("bachs checkout failed: %s", decoded.Detail)
	}
	if _, err := s.pool.Exec(ctx, `INSERT INTO bachs_checkouts (id, student_id, type, status)
		VALUES ($1,$2,$3,'PENDING')`, decoded.CheckoutID, studentID, payType); err != nil {
		return out, err
	}
	return BachsInit{CheckoutURL: decoded.CheckoutURL, CheckoutID: decoded.CheckoutID}, nil
}

func (s *Service) CompleteBachs(ctx context.Context, checkoutID string) error {
	return s.fulfillBachs(ctx, checkoutID, nil)
}

type bachsCharge struct {
	Amount    string `json:"amount"`
	Currency  string `json:"currency"`
	Reference string `json:"reference"`
	Customer  struct {
		Email string `json:"email"`
	} `json:"customer"`
}

func (s *Service) fulfillBachs(ctx context.Context, checkoutID string, charge *bachsCharge) error {
	var mapStudent, mapType, mapStatus string
	if err := s.pool.QueryRow(ctx, `SELECT student_id, type, status FROM bachs_checkouts WHERE id=$1`, checkoutID).Scan(&mapStudent, &mapType, &mapStatus); err != nil {
		return ErrNotFound
	}
	if mapStatus == "FULFILLED" {
		return nil
	}
	if charge == nil {
		if s.cfg.BachsAPIKey == "" {
			return ErrNotConfigured
		}
		co, err := s.retrieveBachsCheckout(ctx, checkoutID)
		if err != nil {
			return err
		}
		chargeID, _ := co["charge_id"].(string)
		if chargeID == "" {
			return ErrNotSuccess
		}
		charge, err = s.retrieveBachsCharge(ctx, chargeID)
		if err != nil {
			return err
		}
	}
	expected := SubscriptionPrice
	if mapType == "resume" {
		expected = ResumePrice
	}
	paid := 0
	fmt.Sscanf(charge.Amount, "%d", &paid)
	if charge.Currency != "" && charge.Currency != "NGN" {
		return ErrBadCurrency
	}
	if paid < expected {
		return fmt.Errorf("%w: expected %d, got %d", ErrUnderpaid, expected, paid)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var freshStatus string
	if err := tx.QueryRow(ctx, `SELECT status FROM bachs_checkouts WHERE id=$1 FOR UPDATE`, checkoutID).Scan(&freshStatus); err != nil {
		return ErrNotFound
	}
	if freshStatus == "FULFILLED" {
		return nil
	}
	var stName, stUID, stEmail string
	var stSub *time.Time
	if err := tx.QueryRow(ctx, `SELECT name, COALESCE(uid,''), email, subscription_until FROM students WHERE id=$1`, mapStudent).Scan(&stName, &stUID, &stEmail, &stSub); err != nil {
		return ErrNotFound
	}
	now := time.Now().UTC()
	email := charge.Customer.Email
	if email == "" {
		email = stEmail
	}
	payType := "subscription"
	var extendsTo *string
	if mapType == "subscription" {
		iso := computeExpiry(stSub, 1).Format(time.RFC3339)
		extendsTo = &iso
		if _, err := tx.Exec(ctx, `UPDATE students SET subscription_until=$1, updated_at=now() WHERE id=$2`,
			computeExpiry(stSub, 1), mapStudent); err != nil {
			return err
		}
		// Same unlock rule as Paystack: paying lifts a suspension.
		if _, err := tx.Exec(ctx, `UPDATE students SET missed_streak=0, suspended=false, appealed_at=$1,
			updated_at=now() WHERE id=$2 AND suspended=true`, now, mapStudent); err != nil {
			return err
		}
	} else if mapType == "resume" {
		payType = "account_resume"
		if _, err := tx.Exec(ctx, `UPDATE students SET missed_streak=0, suspended=false, appealed_at=$1, updated_at=now() WHERE id=$2`, now, mapStudent); err != nil {
			return err
		}
	} else {
		return ErrBadInput
	}
	ref := charge.Reference
	if ref == "" {
		ref = checkoutID
	}
	if _, err := tx.Exec(ctx, `INSERT INTO payments
		(id, student_id, uid, student_name, email, amount, currency, method, reference, checkout_id, type, extends_to, paid_at)
		VALUES ($1,$2,$3,$4,$5,$6,'NGN','bachs',$7,$8,$9,$10,$11)`,
		ids.New(), mapStudent, stUID, stName, email, paid, ref, checkoutID, payType, extendsTo, now); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE bachs_checkouts SET status='FULFILLED', fulfilled_at=$1 WHERE id=$2`, now, checkoutID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) retrieveBachsCheckout(ctx context.Context, id string) (map[string]any, error) {
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://api.bachs.io/v1/checkout-sessions/"+id, nil)
	req.Header.Set("Authorization", "Bearer "+s.cfg.BachsAPIKey)
	res, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	return out, nil
}

func (s *Service) retrieveBachsCharge(ctx context.Context, chargeID string) (*bachsCharge, error) {
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://api.bachs.io/v1/payments/"+chargeID, nil)
	req.Header.Set("Authorization", "Bearer "+s.cfg.BachsAPIKey)
	res, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var ch bachsCharge
	_ = json.Unmarshal(raw, &ch)
	return &ch, nil
}

// BachsWebhook accepts either the shared token or the HMAC signature.
func (s *Service) BachsWebhook(ctx context.Context, queryToken, tsHeader, sigHeader string, rawBody []byte) error {
	tokenOK := s.cfg.BachsWebhookToken != "" &&
		(queryToken == s.cfg.BachsWebhookToken || sigHeader == s.cfg.BachsWebhookToken)
	sigOK := false
	if s.cfg.BachsWebhookSecret != "" {
		if ts, err := strconv.ParseInt(strings.TrimSpace(tsHeader), 10, 64); err == nil {
			skew := time.Now().Unix() - ts
			if skew < 0 {
				skew = -skew
			}
			if skew <= 300 {
				mac := hmac.New(sha256.New, []byte(s.cfg.BachsWebhookSecret))
				mac.Write([]byte(tsHeader + "." + string(rawBody)))
				sig, err := hex.DecodeString(strings.TrimSpace(sigHeader))
				if err == nil && hmac.Equal(sig, mac.Sum(nil)) {
					sigOK = true
				}
			}
		}
	}
	if !tokenOK && !sigOK {
		return ErrUnauthorized
	}
	var event struct {
		Type string          `json:"type"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(rawBody, &event); err != nil {
		return ErrBadInput
	}
	if event.Type == "collection.succeeded" && len(event.Data) > 0 {
		var meta struct {
			CheckoutID string `json:"checkout_id"`
		}
		if err := json.Unmarshal(event.Data, &meta); err != nil || meta.CheckoutID == "" {
			return ErrBadInput
		}
		// Like the Node engine, the whole data object doubles as the charge.
		var charge bachsCharge
		_ = json.Unmarshal(event.Data, &charge)
		return s.fulfillBachs(ctx, meta.CheckoutID, &charge)
	}
	return nil
}

func (s *Service) paystackList(ctx context.Context) ([]map[string]any, error) {
	if s.cfg.PaystackSecret == "" {
		return nil, ErrNotConfigured
	}
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://api.paystack.co/transaction?perPage=100", nil)
	req.Header.Set("Authorization", "Bearer "+s.cfg.PaystackSecret)
	res, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var decoded struct {
		Status  bool             `json:"status"`
		Message string           `json:"message"`
		Data    []map[string]any `json:"data"`
	}
	_ = json.Unmarshal(raw, &decoded)
	if !decoded.Status {
		return nil, fmt.Errorf("paystack fetch failed: %s", decoded.Message)
	}
	return decoded.Data, nil
}

// SyncPaystack pulls recent successful 274L- transactions and fulfills any
// the webhook missed (repair path, admin only).
func (s *Service) SyncPaystack(ctx context.Context) (synced, skipped, failed int, err error) {
	list, err := s.paystackList(ctx)
	if err != nil {
		return 0, 0, 0, err
	}
	for _, trx := range list {
		if trx["status"] != "success" {
			continue
		}
		ref, _ := trx["reference"].(string)
		if !strings.HasPrefix(ref, "274L-") {
			continue
		}
		var hasPay bool
		_ = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM payments WHERE reference=$1)`, ref).Scan(&hasPay)
		if hasPay {
			skipped++
			continue
		}
		var hasMap bool
		_ = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM paystackCheckouts WHERE reference=$1)`, ref).Scan(&hasMap)
		if !hasMap {
			meta, _ := trx["metadata"].(map[string]any)
			sid, _ := meta["studentId"].(string)
			typ, _ := meta["type"].(string)
			if sid == "" {
				parts := strings.Split(ref, "-")
				if len(parts) >= 3 {
					sid = parts[2]
				}
			}
			if typ == "" {
				typ = "subscription"
				if strings.Contains(ref, "-COIN-") {
					typ = "coins"
				}
			}
			var exists bool
			_ = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM students WHERE id=$1)`, sid).Scan(&exists)
			if !exists {
				failed++
				continue
			}
			coins, _ := meta["coins"].(float64)
			price := 0
			if p, ok := meta["priceNgn"].(float64); ok {
				price = int(p)
			}
			if _, err := s.pool.Exec(ctx, `INSERT INTO paystackCheckouts
				(reference, student_id, type, coins, price_ngn, status) VALUES ($1,$2,$3,$4,$5,'PENDING')`,
				ref, sid, typ, intOrNil(int(coins), typ == "coins"), intOrNil(price, true)); err != nil {
				failed++
				continue
			}
		}
		data := trxToPaystackData(trx)
		if _, err := s.fulfillPaystack(ctx, ref, data); err != nil {
			failed++
			continue
		}
		synced++
	}
	return synced, skipped, failed, nil
}

func intOrNil(n int, ok bool) any {
	if !ok {
		return nil
	}
	return n
}

func trxToPaystackData(trx map[string]any) *paystackData {
	d := &paystackData{}
	if v, ok := trx["reference"].(string); ok {
		d.Reference = v
	}
	if v, ok := trx["amount"].(float64); ok {
		d.Amount = int(v)
	}
	if v, ok := trx["currency"].(string); ok {
		d.Currency = v
	}
	if v, ok := trx["status"].(string); ok {
		d.Status = v
	}
	if v, ok := trx["paid_at"].(string); ok {
		d.PaidAt = v
	}
	if cust, ok := trx["customer"].(map[string]any); ok {
		if e, ok := cust["email"].(string); ok {
			d.Customer.Email = e
		}
	}
	return d
}

func orDefault(s, d string) string {
	if s == "" {
		return d
	}
	return s
}

func parseTimeOrNow(s string) time.Time {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t
	}
	return time.Now().UTC()
}

type PaymentRow struct {
	ID          string `json:"id"`
	StudentID   string `json:"studentId"`
	StudentName string `json:"studentName"`
	Email       string `json:"email"`
	Amount      int    `json:"amount"`
	Method      string `json:"method"`
	Reference   string `json:"reference"`
	Type        string `json:"type"`
	PaidAt      string `json:"paidAt"`
}

// ListPayments returns a student's payments (owner/admin).
func (s *Service) ListPayments(ctx context.Context, studentID string) ([]PaymentRow, error) {
	out := []PaymentRow{}
	rows, err := s.pool.Query(ctx, `SELECT id, student_id, student_name, email, amount, method,
		reference, type, paid_at FROM payments WHERE student_id=$1 ORDER BY paid_at DESC LIMIT 100`, studentID)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var p PaymentRow
		var paid time.Time
		if err := rows.Scan(&p.ID, &p.StudentID, &p.StudentName, &p.Email, &p.Amount,
			&p.Method, &p.Reference, &p.Type, &paid); err == nil {
			p.PaidAt = paid.UTC().Format(time.RFC3339)
			out = append(out, p)
		}
	}
	return out, nil
}

// AdminPayments pages all payments with optional name search.
func (s *Service) AdminPayments(ctx context.Context, search string, page, pageSize int) ([]PaymentRow, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	out := []PaymentRow{}
	var total int
	like := "%" + search + "%"
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM payments WHERE $1='' OR student_name ILIKE $2`,
		search, like).Scan(&total); err != nil {
		return out, 0, err
	}
	rows, err := s.pool.Query(ctx, `SELECT id, student_id, student_name, email, amount, method,
		reference, type, paid_at FROM payments WHERE $1='' OR student_name ILIKE $2
		ORDER BY paid_at DESC LIMIT $3 OFFSET $4`, search, like, pageSize, (page-1)*pageSize)
	if err != nil {
		return out, total, err
	}
	defer rows.Close()
	for rows.Next() {
		var p PaymentRow
		var paid time.Time
		if err := rows.Scan(&p.ID, &p.StudentID, &p.StudentName, &p.Email, &p.Amount,
			&p.Method, &p.Reference, &p.Type, &paid); err == nil {
			p.PaidAt = paid.UTC().Format(time.RFC3339)
			out = append(out, p)
		}
	}
	return out, total, nil
}
