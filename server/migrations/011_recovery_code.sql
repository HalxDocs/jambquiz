-- 011: recovery code column (set when accountability intro is sent).
ALTER TABLE students ADD COLUMN IF NOT EXISTS recovery_code TEXT;
