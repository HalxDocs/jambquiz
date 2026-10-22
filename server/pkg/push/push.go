// WebPush delivery via VAPID (RFC 8291 handled by webpush-go).
package push

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

type Sender struct {
	PublicKey  string
	PrivateKey string
	Subject    string
}

func (s *Sender) Configured() bool {
	return s.PublicKey != "" && s.PrivateKey != ""
}

// Result describes the outcome of one delivery attempt.
type Result struct {
	// Sent is true when the push service accepted the message (2xx).
	Sent bool
	// Gone is true when the endpoint itself is dead (404/410). The row can be
	// deleted outright.
	Gone bool
	// Stale is true when the push service refused the message because the
	// subscription is bound to a different VAPID key than the one we sign
	// with (401/403). The subscription is not dead — the browser has to
	// re-subscribe with the current applicationServerKey, which is the only
	// way to revive it.
	Stale bool
	// Status is the HTTP status returned by the push service, 0 on a
	// transport error.
	Status int
	// Err carries the transport error, if any.
	Err error
}

// Send delivers payload to one subscription.
func (s *Sender) Send(endpoint, p256dh, auth string, payload any, ttl int) Result {
	raw, err := json.Marshal(payload)
	if err != nil {
		return Result{Err: err}
	}
	sub := &webpush.Subscription{Endpoint: endpoint, Keys: webpush.Keys{P256dh: p256dh, Auth: auth}}
	if ttl <= 0 {
		ttl = 86400
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	resp, err := webpush.SendNotificationWithContext(ctx, raw, sub, &webpush.Options{
		Subscriber:      s.Subject,
		VAPIDPublicKey:  s.PublicKey,
		VAPIDPrivateKey: s.PrivateKey,
		TTL:             ttl,
	})
	if err != nil {
		return Result{Err: err}
	}
	defer resp.Body.Close()
	res := Result{Status: resp.StatusCode}
	switch {
	case resp.StatusCode == 404 || resp.StatusCode == 410:
		res.Gone = true
	case resp.StatusCode == 401 || resp.StatusCode == 403:
		res.Stale = true
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		res.Sent = true
	default:
		res.Err = fmt.Errorf("webpush HTTP %d", resp.StatusCode)
	}
	return res
}
