package notify

import (
	"errors"
	"testing"

	"github.com/274lab/server/pkg/push"
)

func TestRetryablePushResult(t *testing.T) {
	cases := []struct {
		name string
		res  push.Result
		want bool
	}{
		{"network error", push.Result{Err: errors.New("connection reset"), Status: 0}, true},
		{"rate limited", push.Result{Status: 429}, true},
		{"server error", push.Result{Status: 503}, true},
		{"bad request", push.Result{Status: 400}, false},
		{"gone endpoint", push.Result{Status: 410, Gone: true}, false},
		{"stale key", push.Result{Status: 403, Stale: true}, false},
		{"success", push.Result{Status: 201, Sent: true}, false},
	}
	for _, tc := range cases {
		if got := retryablePushResult(tc.res); got != tc.want {
			t.Errorf("%s: got %v want %v", tc.name, got, tc.want)
		}
	}
}
