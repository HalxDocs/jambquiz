// Command pushcheck reports the health of the push subscriber table.
//
// It verifies the VAPID key pair, then attempts one delivery per stored
// subscription and summarises what the push services answered. This is the
// fastest way to tell apart the failure modes that all look identical from
// the outside ("push does not work"):
//
//	201/2xx  the device received it
//	403      the subscription is bound to a VAPID key we no longer use — the
//	         device must reopen the app to re-subscribe
//	410/404  the endpoint is dead and was removed
//	401      the endpoint rejected our authorisation
//
// Usage:
//
//	DATABASE_URL=... VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
//	    go run ./cmd/pushcheck
package main

import (
	"context"
	"crypto/ecdh"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/jackc/pgx/v5/pgxpool"
)

type sub struct {
	studentID string
	endpoint  string
	p256dh    string
	auth      string
	created   time.Time
}

func host(e string) string {
	for _, h := range []string{
		"fcm.googleapis.com", "notify.windows.com",
		"push.services.mozilla.com", "web.push.apple.com",
	} {
		if strings.Contains(e, h) {
			return h
		}
	}
	if i := strings.Index(e, "://"); i >= 0 {
		rest := e[i+3:]
		if j := strings.Index(rest, "/"); j > 0 {
			return rest[:j]
		}
	}
	return "other"
}

func main() {
	pub := os.Getenv("VAPID_PUBLIC_KEY")
	priv := os.Getenv("VAPID_PRIVATE_KEY")
	subj := os.Getenv("VAPID_SUBJECT")
	if subj == "" {
		subj = "mailto:admin@274lab.com"
	}

	fmt.Println("=== VAPID pair ===")
	pubBytes, pubErr := base64.RawURLEncoding.DecodeString(pub)
	privBytes, privErr := base64.RawURLEncoding.DecodeString(priv)
	fmt.Printf("public  %d bytes\nprivate %d bytes\n", len(pubBytes), len(privBytes))
	if pubErr != nil || privErr != nil {
		fmt.Printf("base64url decode failed: public=%v private=%v\n", pubErr, privErr)
	} else if len(privBytes) == 32 {
		if priv, err := ecdh.P256().NewPrivateKey(privBytes); err == nil {
			derived := base64.RawURLEncoding.EncodeToString(priv.PublicKey().Bytes())
			if derived == pub {
				fmt.Println("pair: MATCHES")
			} else {
				fmt.Println("pair: MISMATCH — the public key does not belong to this private key")
			}
		}
	} else {
		fmt.Println("private key is not a 32-byte scalar — it looks like the keys are swapped")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		fmt.Printf("db: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	rows, err := pool.Query(ctx, `SELECT student_id, endpoint, keys->>'p256dh', keys->>'auth', created_at
		FROM push_subscriptions`)
	if err != nil {
		fmt.Printf("query: %v\n", err)
		os.Exit(1)
	}
	var subs []sub
	for rows.Next() {
		var s sub
		if err := rows.Scan(&s.studentID, &s.endpoint, &s.p256dh, &s.auth, &s.created); err == nil {
			subs = append(subs, s)
		}
	}
	rows.Close()
	sort.Slice(subs, func(i, j int) bool { return subs[i].created.Before(subs[j].created) })

	fmt.Printf("\n=== delivery check over %d subscription(s) ===\n", len(subs))
	payload, _ := json.Marshal(map[string]any{
		"point": "274Lab push check.", "subject": "Test",
		"id": fmt.Sprintf("check-%d", time.Now().UnixMilli()), "isQuestion": false,
	})

	type stat struct{ total, ok, stale, gone, unauthorized, failed int }
	byHost := map[string]*stat{}
	overall := &stat{}
	for _, s := range subs {
		sp := &webpush.Subscription{Endpoint: s.endpoint, Keys: webpush.Keys{P256dh: s.p256dh, Auth: s.auth}}
		sendCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		resp, err := webpush.SendNotificationWithContext(sendCtx, payload, sp, &webpush.Options{
			Subscriber: subj, VAPIDPublicKey: pub, VAPIDPrivateKey: priv, TTL: 3600,
		})
		cancel()

		h := host(s.endpoint)
		if byHost[h] == nil {
			byHost[h] = &stat{}
		}
		st := byHost[h]
		st.total++
		overall.total++

		label := ""
		switch {
		case err != nil:
			st.failed++
			overall.failed++
			label = "transport error"
		default:
			code := resp.StatusCode
			resp.Body.Close()
			switch {
			case code >= 200 && code < 300:
				st.ok++
				overall.ok++
				label = "delivered"
			case code == 403:
				st.stale++
				overall.stale++
				label = "403 stale (bound to an older VAPID key)"
			case code == 410 || code == 404:
				st.gone++
				overall.gone++
				label = "gone (endpoint expired)"
			case code == 401:
				st.unauthorized++
				overall.unauthorized++
				label = "401 unauthorized"
			default:
				st.failed++
				overall.failed++
				label = fmt.Sprintf("HTTP %d", code)
			}
		}
		fmt.Printf("  %s  %-34s %s\n", s.created.Format("2006-01-02 15:04"), h, label)
	}

	fmt.Println("\n=== summary ===")
	for h, st := range byHost {
		fmt.Printf("%-26s total=%-4d delivered=%-4d stale=%-4d gone=%-4d unauthorized=%-3d failed=%d\n",
			h, st.total, st.ok, st.stale, st.gone, st.unauthorized, st.failed)
	}
	fmt.Printf("%-26s total=%-4d delivered=%-4d stale=%-4d gone=%-4d unauthorized=%-3d failed=%d\n",
		"ALL", overall.total, overall.ok, overall.stale, overall.gone, overall.unauthorized, overall.failed)
	if overall.stale > 0 {
		fmt.Println("\nstale subscriptions must reopen the app — the browser re-subscribes with the current VAPID key")
	}
}
