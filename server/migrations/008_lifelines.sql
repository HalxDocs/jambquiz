-- 008: lifeline usage cache on sessions + share dedupe on students.
ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS lifeline_usage JSONB NOT NULL DEFAULT '{}';
ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS narrowed JSONB NOT NULL DEFAULT '{}';
ALTER TABLE students ADD COLUMN IF NOT EXISTS shared_tests JSONB NOT NULL DEFAULT '{}';
