-- 017: portfolio guestbook (halxdocs.com), separate from the 274Lab wall.
CREATE TABLE IF NOT EXISTS portfolio_guestbook (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL DEFAULT '',
  signature  TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portfolio_guestbook_created ON portfolio_guestbook (created_at DESC);
