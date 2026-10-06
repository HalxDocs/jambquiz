-- 004: push, notifications, admin, leaderboards, analytics.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  student_id TEXT PRIMARY KEY REFERENCES students (id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  keys       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_state (
  student_id              TEXT PRIMARY KEY REFERENCES students (id) ON DELETE CASCADE,
  seen_points             JSONB NOT NULL DEFAULT '{}',
  current_cycle_index     INTEGER NOT NULL DEFAULT 0,
  patches_active          BOOLEAN NOT NULL DEFAULT FALSE,
  selected_patch_subjects TEXT[] NOT NULL DEFAULT '{}',
  last_notified_at        TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  target     TEXT NOT NULL DEFAULT 'all',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Schemaless admin settings (notifications toggle, stats_counters,
-- corrections_released_*, quiz_time_reminder_* guards, ...).
CREATE TABLE IF NOT EXISTS admin_settings (
  id         TEXT PRIMARY KEY,
  data       JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reminder_sent (
  key      TEXT PRIMARY KEY,
  sent_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admin_stats (
  id         TEXT PRIMARY KEY,
  data       JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cached leaderboard boards (overall, subject_*, week_*).
CREATE TABLE IF NOT EXISTS leaderboard_cache (
  id         TEXT PRIMARY KEY,
  top        JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leaderboard_student_ranks (
  student_id     TEXT PRIMARY KEY REFERENCES students (id) ON DELETE CASCADE,
  name           TEXT NOT NULL DEFAULT '',
  nickname       TEXT NOT NULL DEFAULT '',
  year           TEXT NOT NULL DEFAULT '',
  subjects       TEXT[] NOT NULL DEFAULT '{}',
  best_by_subject JSONB NOT NULL DEFAULT '{}',
  sessions       JSONB NOT NULL DEFAULT '{}',
  weeks          JSONB NOT NULL DEFAULT '{}',
  total          INTEGER NOT NULL DEFAULT 0,
  session_count  INTEGER NOT NULL DEFAULT 0,
  gold_medals    INTEGER NOT NULL DEFAULT 0,
  qualified      BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ranks_total ON leaderboard_student_ranks (total DESC) WHERE qualified;

CREATE TABLE IF NOT EXISTS leaderboard_week_ranks (
  id            TEXT PRIMARY KEY,
  student_id    TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  week          TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  nickname      TEXT NOT NULL DEFAULT '',
  total         INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, week)
);
CREATE INDEX IF NOT EXISTS idx_week_ranks ON leaderboard_week_ranks (week, total DESC);

CREATE TABLE IF NOT EXISTS usage_logs (
  id         BIGSERIAL PRIMARY KEY,
  student_id TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT '',
  meta       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_logs_event ON usage_logs (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  key       TEXT PRIMARY KEY,
  bucket    BIGINT NOT NULL,
  count     INTEGER NOT NULL DEFAULT 0,
  expire_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public_stats (
  key        TEXT PRIMARY KEY,
  data       JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
