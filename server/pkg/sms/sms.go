// Termii SMS client: DND-first, generic fallback, 765-char cap.
package sms

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	APIKey   string
	SenderID string
	http     *http.Client
}

func New(apiKey, senderID string) *Client {
	if senderID == "" {
		senderID = "274Lab"
	}
	return &Client{APIKey: apiKey, SenderID: senderID, http: &http.Client{Timeout: 20 * time.Second}}
}

type Result struct {
	OK       bool
	Channel  string
	DNDError string
	Error    string
}

func termiiOK(body map[string]any) bool {
	if body == nil {
		return false
	}
	if e, ok := body["error"]; ok && e != nil && e != "" {
		return false
	}
	if m, ok := body["message"].(map[string]any); ok {
		if _, bad := m["err"]; bad {
			return false
		}
	}
	code, _ := body["code"].(string)
	msg, _ := body["message"].(string)
	_, hasBalance := body["balance"]
	return code == "ok" || msg == "Successfully Sent" || hasBalance
}

func termiiErr(body map[string]any, status int) string {
	if body != nil {
		if m, ok := body["message"].(map[string]any); ok {
			if e, ok := m["err"]; ok {
				return fmt.Sprint(e)
			}
		}
		if e, ok := body["error"]; ok && e != nil && e != "" {
			return fmt.Sprint(e)
		}
		if m, ok := body["message"].(string); ok && m != "" {
			return m
		}
	}
	return fmt.Sprintf("Termii HTTP %d", status)
}

func (c *Client) send(ctx context.Context, to, text, channel string) (map[string]any, int, error) {
	if len(text) > 765 {
		text = text[:765]
	}
	payload, _ := json.Marshal(map[string]any{
		"api_key": c.APIKey, "to": to, "from": c.SenderID,
		"sms": text, "type": "plain", "channel": channel,
	})
	req, _ := http.NewRequestWithContext(ctx, "POST", "https://api.termii.com/api/sms/send", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var body map[string]any
	_ = json.Unmarshal(raw, &body)
	return body, res.StatusCode, nil
}

// Send tries the DND route first (most NG lines are DND), then generic.
func (c *Client) Send(ctx context.Context, to, text string) Result {
	body, status, err := c.send(ctx, to, text, "dnd")
	if err != nil {
		return Result{Error: err.Error()}
	}
	dndErr := ""
	if status < 200 || status >= 300 || !termiiOK(body) {
		dndErr = termiiErr(body, status)
		body, status, err = c.send(ctx, to, text, "generic")
		if err != nil {
			return Result{Channel: "generic", DNDError: dndErr, Error: err.Error()}
		}
		if status < 200 || status >= 300 || !termiiOK(body) {
			return Result{Channel: "generic", DNDError: dndErr, Error: termiiErr(body, status)}
		}
		return Result{OK: true, Channel: "generic", DNDError: dndErr}
	}
	return Result{OK: true, Channel: "dnd"}
}

// Normalize mirrors the Node server helper (null -> "").
func Normalize(p string) string {
	s := strings.Map(func(r rune) rune {
		if r == ' ' || r == '-' || r == '(' || r == ')' {
			return -1
		}
		return r
	}, p)
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "+") {
		s = s[1:]
	}
	if strings.HasPrefix(s, "0") {
		s = "234" + s[1:]
	} else if len(s) == 10 && (s[0] == '7' || s[0] == '8' || s[0] == '9') {
		s = "234" + s
	}
	if len(s) < 10 || len(s) > 14 {
		return ""
	}
	return s
}
