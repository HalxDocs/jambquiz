package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool opens the connection pool and waits for the database to answer.
//
// The ping timeout has to be generous. Railway's Postgres proxy can take
// noticeably longer than a few seconds to accept a connection right after a
// deploy, and a ping that gives up too early returns a nil pool: the API
// then starts without a database, every request fails, and the scheduler
// silently never runs.
func NewPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 10
	cfg.MinConns = 1
	cfg.MaxConnLifetime = time.Hour

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}

	var lastErr error
	for attempt := 1; attempt <= 5; attempt++ {
		pingCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		lastErr = pool.Ping(pingCtx)
		cancel()
		if lastErr == nil {
			return pool, nil
		}
		if ctx.Err() != nil {
			break
		}
		if attempt < 5 {
			time.Sleep(time.Duration(attempt) * 2 * time.Second)
		}
	}
	pool.Close()
	return nil, fmt.Errorf("database unreachable after 5 attempts: %w", lastErr)
}
