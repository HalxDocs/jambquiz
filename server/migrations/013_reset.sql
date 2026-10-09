-- 013: password-reset flow columns.
ALTER TABLE students ADD COLUMN IF NOT EXISTS reset_code TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS reset_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS reset_last_attempt TIMESTAMPTZ;
