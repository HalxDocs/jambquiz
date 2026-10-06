// Minimal HS256 JWT (stdlib only): header.payload.signature with exp claim.
package jwt

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type Claims struct {
	Sub  string `json:"sub"`
	Role string `json:"role"`
	Iat  int64  `json:"iat"`
	Exp  int64  `json:"exp"`
}

var (
	ErrMalformed = errors.New("malformed token")
	ErrSignature = errors.New("bad signature")
	ErrExpired   = errors.New("token expired")
)

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func Sign(secret, subject, role string, ttl time.Duration) (string, error) {
	now := time.Now().Unix()
	head := b64([]byte(`{"alg":"HS256","typ":"JWT"}`))
	bodyMap := Claims{Sub: subject, Role: role, Iat: now, Exp: now + int64(ttl.Seconds())}
	bodyBytes, err := json.Marshal(bodyMap)
	if err != nil {
		return "", err
	}
	body := b64(bodyBytes)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(head + "." + body))
	return head + "." + body + "." + b64(mac.Sum(nil)), nil
}

func Verify(secret, token string) (Claims, error) {
	var c Claims
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return c, ErrMalformed
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(parts[0] + "." + parts[1]))
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(sig, mac.Sum(nil)) {
		return c, ErrSignature
	}
	body, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return c, ErrMalformed
	}
	if err := json.Unmarshal(body, &c); err != nil {
		return c, ErrMalformed
	}
	if c.Sub == "" || time.Now().Unix() > c.Exp {
		return c, ErrExpired
	}
	return c, nil
}
