-- Durable scheduler history and retryable Web Push deliveries.
CREATE TABLE IF NOT EXISTS scheduler_job_runs (
  id           BIGSERIAL PRIMARY KEY,
  job_name     TEXT NOT NULL,
  worker_id    TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  duration_ms  BIGINT NOT NULL DEFAULT 0,
  summary      TEXT NOT NULL DEFAULT '',
  error        TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS scheduler_job_runs_latest
  ON scheduler_job_runs (job_name, started_at DESC);

CREATE TABLE IF NOT EXISTS scheduler_workers (
  worker_id     TEXT PRIMARY KEY,
  role          TEXT NOT NULL DEFAULT 'api',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduler_workers_last_seen
  ON scheduler_workers (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS push_outbox (
  id                BIGSERIAL PRIMARY KEY,
  delivery_key      TEXT NOT NULL UNIQUE,
  student_id        TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  endpoint          TEXT NOT NULL,
  p256dh            TEXT NOT NULL,
  auth              TEXT NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'scheduled',
  campaign_count    INTEGER,
  payload           JSONB NOT NULL,
  ttl_seconds       INTEGER NOT NULL DEFAULT 3600,
  status            TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'gone', 'stale', 'cancelled')),
  attempts          INTEGER NOT NULL DEFAULT 0,
  next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at         TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  last_error        TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_outbox_ready
  ON push_outbox (next_attempt_at, id)
  WHERE status IN ('queued', 'sending');

CREATE INDEX IF NOT EXISTS push_outbox_student_created
  ON push_outbox (student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS push_outbox_attention
  ON push_outbox (id)
  WHERE status IN ('failed','stale');
