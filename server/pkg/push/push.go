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

// Send delivers payload to one subscription. Expired endpoints (410/404)
// are reported so callers can prune them.
func (s *Sender) Send(endpoint, p256dh, auth string, payload any, ttl int) (sent bool, gone bool, err error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return false, false, err
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
		return false, false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 || resp.StatusCode == 410 {
		return false, true, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return false, false, fmt.Errorf("webpush HTTP %d", resp.StatusCode)
	}
	return true, false, nil
}
