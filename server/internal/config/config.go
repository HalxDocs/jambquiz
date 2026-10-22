package config

import (
	"crypto/sha256"
	"encoding/hex"
	"log"
	"os"
)

// devJWTSecret is the signing secret used for local development only.
//
// It used to be the fallback for every environment, which meant anybody could
// mint an "admin" token with it and use every admin endpoint (broadcasts,
// student data, payment settings). It is published in this repository, so it
// must never be used to sign a real session.
const devJWTSecret = "dev-only-secret-change-me"

// devDatabaseURL is the default local database. It is the signal that this
// process is a developer machine rather than a deployment.
const devDatabaseURL = "postgres://jambapp:jambapp_dev@127.0.0.1:5433/jambquiz?sslmode=disable"

type Config struct {
	Env                  string
	Port                 string
	DatabaseURL          string
	JWTSecret            string
	PaystackSecret       string
	PaystackCallbackURL  string
	BachsAPIKey          string
	BachsSubProductID    string
	BachsResumeProductID string
	BachsWebhookToken    string
	BachsWebhookSecret   string
	VapidPublic          string
	VapidPrivate         string
	VapidSubject         string
	TermiiKey            string
	TermiiSender         string
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// jwtSecret decides the key that signs API tokens.
//
// Order of preference:
//
//  1. JWT_SECRET from the environment. This is what a deployment should set,
//     and it is the only value that survives a change of the other settings.
//  2. The development secret, but only when this is a developer machine
//     (local database). It is public, so it can never sign a real session.
//  3. A secret derived from DATABASE_URL. The database password is already a
//     secret held by the platform, and hashing it gives a stable value: the
//     sessions survive a restart instead of being invalidated every deploy.
//
// The warning matters more than the mechanism: JWT_SECRET should be set
// explicitly, because anyone who knows the signing key can impersonate any
// student or the administrator.
func jwtSecret() string {
	if s := os.Getenv("JWT_SECRET"); s != "" && s != devJWTSecret {
		return s
	}
	dsn := getenv("DATABASE_URL", devDatabaseURL)
	if dsn == devDatabaseURL {
		return devJWTSecret
	}
	sum := sha256.Sum256([]byte("274lab/jwt/v1|" + dsn))
	log.Printf("[config] JWT_SECRET is not set — signing tokens with a key derived from DATABASE_URL. Set JWT_SECRET in the environment; until then the key rotates whenever the database credentials change.")
	return hex.EncodeToString(sum[:])
}

func Load() Config {
	return Config{
		Env:         getenv("ENV", "dev"),
		Port:        getenv("PORT", "8081"),
		DatabaseURL: getenv("DATABASE_URL", devDatabaseURL),
		JWTSecret:   jwtSecret(),

		PaystackSecret:       getenv("PAYSTACK_SECRET_KEY", ""),
		PaystackCallbackURL:  getenv("PAYSTACK_CALLBACK_URL", ""),
		BachsAPIKey:          getenv("BACHS_API_KEY", ""),
		BachsSubProductID:    getenv("BACHS_SUBSCRIPTION_PRODUCT_ID", ""),
		BachsResumeProductID: getenv("BACHS_RESUME_PRODUCT_ID", ""),
		BachsWebhookToken:    getenv("BACHS_WEBHOOK_TOKEN", ""),
		BachsWebhookSecret:   getenv("BACHS_WEBHOOK_SECRET", ""),
		VapidPublic:          getenv("VAPID_PUBLIC_KEY", "BJqD_ezLHEOxBYdQk3j2hNXfw1ENHoSJKYvSKqez-pYgWqiqS0DQQDbxP_1YmWqNgghItgbDjBhKrylOTselddw"),
		VapidPrivate:         getenv("VAPID_PRIVATE_KEY", ""),
		VapidSubject:         getenv("VAPID_SUBJECT", "mailto:admin@274lab.com"),
		TermiiKey:            getenv("TERMII_API_KEY", ""),
		TermiiSender:         getenv("TERMII_SENDER_ID", "274Lab"),
	}
}
