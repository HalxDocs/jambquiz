package config

import (
	"os"
)

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

func Load() Config {
	return Config{
		Env:         getenv("ENV", "dev"),
		Port:        getenv("PORT", "8081"),
		DatabaseURL: getenv("DATABASE_URL", "postgres://jambapp:jambapp_dev@127.0.0.1:5433/jambquiz?sslmode=disable"),
		JWTSecret:   getenv("JWT_SECRET", "dev-only-secret-change-me"),

		PaystackSecret:       getenv("PAYSTACK_SECRET_KEY", ""),
		PaystackCallbackURL:  getenv("PAYSTACK_CALLBACK_URL", ""),
		BachsAPIKey:          getenv("BACHS_API_KEY", ""),
		BachsSubProductID:    getenv("BACHS_SUBSCRIPTION_PRODUCT_ID", ""),
		BachsResumeProductID: getenv("BACHS_RESUME_PRODUCT_ID", ""),
		BachsWebhookToken:    getenv("BACHS_WEBHOOK_TOKEN", ""),
		BachsWebhookSecret:   getenv("BACHS_WEBHOOK_SECRET", ""),
		VapidPublic:          getenv("VAPID_PUBLIC_KEY", "BJV0OfUDKqQg7gPD1BusnRjhhc1fhjnheW6Ghp2W9T5squ3RhMZMrNVqHiCM0M3lOeJLaq_4K_Z3WL_0PcUn_Bg"),
		VapidPrivate:         getenv("VAPID_PRIVATE_KEY", ""),
		VapidSubject:         getenv("VAPID_SUBJECT", "mailto:admin@274lab.com"),
		TermiiKey:            getenv("TERMII_API_KEY", ""),
		TermiiSender:         getenv("TERMII_SENDER_ID", "274Lab"),
	}
}
