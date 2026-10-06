package ids

import (
	"crypto/rand"
	"encoding/hex"
)

// New returns a 24-hex-char random ID (TEXT PKs, Firestore-style opaque IDs).
func New() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b[:])
}
