package ratelimit

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Allow is a fixed-window throttle backed by rate_limits. Fail-open: any DB
// error allows the request (matches the Node engine's throttling posture).
func Allow(ctx context.Context, pool *pgxpool.Pool, key string, max int, windowMs int64) bool {
	now := time.Now().UnixMilli()
	bucket := now / windowMs
	var b *int64
	var count int
	err := pool.QueryRow(ctx, `SELECT bucket, count FROM rate_limits WHERE key = $1`, key).Scan(&b, &count)
	if err != nil || b == nil || *b != bucket {
		_, err := pool.Exec(ctx, `INSERT INTO rate_limits (key, bucket, count, expire_at)
			VALUES ($1,$2,1,$3) ON CONFLICT (key) DO UPDATE SET bucket=$2, count=1, expire_at=$3`,
			key, bucket, time.UnixMilli(now+windowMs).UTC())
		return err == nil
	}
	if count >= max {
		return false
	}
	_, err = pool.Exec(ctx, `UPDATE rate_limits SET count = count + 1 WHERE key = $1`, key)
	return err == nil
}
