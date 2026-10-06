# 274Lab Go backend (Gin + Postgres)

Parallel build. Firebase stays live until cutover.

## Run (dev)

```bash
~/bin/jamb-pg-start            # local Postgres 18 on 127.0.0.1:5433
cd server
go run ./cmd/api               # :8081
curl localhost:8081/healthz
```

## Layout

- `cmd/api` — entrypoint, routes, graceful shutdown
- `internal/config` — env-based config
- `internal/db` — pgx pool
- `internal/middleware` — auth guards (step: auth)
- `internal/modules/*` — one package per domain
- `migrations/` — SQL migrations, applied in order
- `pkg/` — shared clients (jwt, hash, paystack, termii)
```
