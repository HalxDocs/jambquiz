// Command vapidgen prints a fresh VAPID keypair for web push.
//
// webpush-go's GenerateVAPIDKeys returns (privateKey, publicKey) — private
// first. Assigning them the other way round produces a pair that is internally
// consistent but labelled backwards, which fails at send time with the opaque
// "ecdsa: private key scalar too large" rather than a config error.
package main

import (
	"encoding/base64"
	"fmt"
	"os"

	webpush "github.com/SherClockHolmes/webpush-go"
)

func mustDecode(s string) []byte {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		fmt.Fprintln(os.Stderr, "decode:", err)
		os.Exit(1)
	}
	return b
}

func main() {
	priv, pub, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		fmt.Fprintln(os.Stderr, "generate:", err)
		os.Exit(1)
	}
	// Verify the labels by decoded length: a P-256 scalar is 32 bytes and an
	// uncompressed curve point is 65.
	privLen := len(mustDecode(priv))
	pubLen := len(mustDecode(pub))
	if privLen != 32 || pubLen != 65 {
		fmt.Fprintf(os.Stderr, "unexpected key sizes: private=%d bytes (want 32), public=%d bytes (want 65)\n", privLen, pubLen)
		os.Exit(1)
	}
	fmt.Println("Set these together — a mismatched pair fails silently at send time.")
	fmt.Println("VAPID_PUBLIC_KEY=" + pub)
	fmt.Println("VAPID_PRIVATE_KEY=" + priv)
}
