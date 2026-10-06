package notify

import "errors"

var (
	errNotFound      = errors.New("not found")
	errForbidden     = errors.New("forbidden")
	errBadInput      = errors.New("invalid input")
	errRateLimited   = errors.New("too many requests, try again later")
	errNotConfigured = errors.New("not configured")
)

func errSendFailed(msg string) error {
	if msg == "" {
		msg = "send failed"
	}
	return errors.New(msg)
}
