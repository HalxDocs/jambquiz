package config

import (
	"os"
)

type Config struct {
	Env         string
	Port        string
	DatabaseURL string
	JWTSecret   string
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
	}
}
