-- 003: payments, checkouts, coins, lifelines.

CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES students (id) ON DELETE SET NULL,
  uid          TEXT NOT NULL DEFAULT '',
  student_name TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  amount       INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'NGN',
  method       TEXT NOT NULL DEFAULT '',
  reference    TEXT NOT NULL UNIQUE,
  checkout_id  TEXT NOT NULL DEFAULT '',
  type         TEXT NOT NULL DEFAULT 'subscription',
  coins        INTEGER,
  extends_to   TIMESTAMPTZ,
  paid_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments (student_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments (paid_at DESC);

CREATE TABLE IF NOT EXISTS paystack_checkouts (
  reference    TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'subscription',
  status       TEXT NOT NULL DEFAULT 'PENDING',
  access_code  TEXT NOT NULL DEFAULT '',
  pack_id      TEXT,
  coins        INTEGER,
  price_ngn    INTEGER,
  data         JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  fulfilled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_paystack_checkouts_student ON paystack_checkouts (student_id);

CREATE TABLE IF NOT EXISTS bachs_checkouts (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'subscription',
  status       TEXT NOT NULL DEFAULT 'PENDING',
  access_code  TEXT NOT NULL DEFAULT '',
  data         JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  fulfilled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bachs_checkouts_student ON bachs_checkouts (student_id);

CREATE TABLE IF NOT EXISTS coin_packs (
  id        TEXT PRIMARY KEY,
  coins     INTEGER NOT NULL CHECK (coins > 0),
  price_ngn INTEGER NOT NULL CHECK (price_ngn > 0)
);

CREATE TABLE IF NOT EXISTS coin_ledger (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  uid        TEXT NOT NULL DEFAULT '',
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL DEFAULT '',
  ref        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coin_ledger_student ON coin_ledger (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_ledger_reason ON coin_ledger (reason);

CREATE TABLE IF NOT EXISTS goats (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  profession   TEXT NOT NULL DEFAULT '',
  stars        JSONB NOT NULL DEFAULT '{}',
  explanations JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goat_weeks (
  week     TEXT PRIMARY KEY,
  goat_ids TEXT[] NOT NULL
);
