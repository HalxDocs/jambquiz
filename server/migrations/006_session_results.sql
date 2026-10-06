-- 006: session result storage for idempotent submit replays.
ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS results JSONB NOT NULL DEFAULT '[]';
ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS score_ids TEXT[] NOT NULL DEFAULT '{}';
