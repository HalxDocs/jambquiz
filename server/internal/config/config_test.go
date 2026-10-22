package config

import "testing"

func TestJWTSecretPrefersTheEnvironment(t *testing.T) {
	t.Setenv("JWT_SECRET", "a-real-secret")
	t.Setenv("DATABASE_URL", "postgres://someone:hunter2@db.example.com:5432/app")
	if got := jwtSecret(); got != "a-real-secret" {
		t.Fatalf("expected the environment secret, got %q", got)
	}
}

func TestJWTSecretNeverUsesThePublishedDevSecretOutsideDevelopment(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	t.Setenv("DATABASE_URL", "postgres://someone:hunter2@db.example.com:5432/app")
	got := jwtSecret()
	if got == devJWTSecret {
		t.Fatal("the published development secret must never sign a real session")
	}
	if got == "" {
		t.Fatal("expected a derived secret")
	}
	// The derived secret has to be stable, otherwise every restart would
	// invalidate every session.
	if again := jwtSecret(); again != got {
		t.Fatalf("derived secret is not stable: %q then %q", got, again)
	}
}

func TestJWTSecretRejectsThePublishedDevSecretFromTheEnvironment(t *testing.T) {
	t.Setenv("JWT_SECRET", devJWTSecret)
	t.Setenv("DATABASE_URL", "postgres://someone:hunter2@db.example.com:5432/app")
	if got := jwtSecret(); got == devJWTSecret {
		t.Fatal("the published development secret must never sign a real session")
	}
}

func TestJWTSecretKeepsTheDevSecretOnADeveloperMachine(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	t.Setenv("DATABASE_URL", devDatabaseURL)
	if got := jwtSecret(); got != devJWTSecret {
		t.Fatalf("expected the development secret locally, got %q", got)
	}
}
