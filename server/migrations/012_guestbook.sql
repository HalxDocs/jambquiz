-- 012: guestbook (public wall).
CREATE TABLE IF NOT EXISTS guestbook (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL DEFAULT '',
  signature  TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_guestbook_created ON guestbook (created_at DESC);
