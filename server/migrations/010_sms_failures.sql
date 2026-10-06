-- 010: persisted SMS failure log for admin triage.
CREATE TABLE IF NOT EXISTS sms_failures (
  id         BIGSERIAL PRIMARY KEY,
  recipient  TEXT NOT NULL DEFAULT '',
  sms        TEXT NOT NULL DEFAULT '',
  error      TEXT NOT NULL DEFAULT '',
  sender_id  TEXT NOT NULL DEFAULT '',
  student_id TEXT,
  week       TEXT,
  label      TEXT,
  source     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_failures_created ON sms_failures (created_at DESC);
