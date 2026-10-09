-- 014: GOAT per-subject comments (shown in picker).
ALTER TABLE goats ADD COLUMN IF NOT EXISTS comments JSONB NOT NULL DEFAULT '{}';
