package jwt

import (
	"testing"
	"time"
)

func TestRoundtrip(t *testing.T) {
	tok, err := Sign("s3cret", "stu123", "student", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	c, err := Verify("s3cret", tok)
	if err != nil {
		t.Fatal(err)
	}
	if c.Sub != "stu123" || c.Role != "student" {
		t.Fatalf("bad claims: %+v", c)
	}
}

func TestExpiryAndTamper(t *testing.T) {
	tok, _ := Sign("s3cret", "a", "student", -time.Second)
	if _, err := Verify("s3cret", tok); err != ErrExpired {
		t.Fatalf("want expired, got %v", err)
	}
	tok2, _ := Sign("s3cret", "a", "student", time.Hour)
	if _, err := Verify("other", tok2); err != ErrSignature {
		t.Fatalf("want bad signature, got %v", err)
	}
	if _, err := Verify("s3cret", "junk"); err != ErrMalformed {
		t.Fatalf("want malformed, got %v", err)
	}
}
