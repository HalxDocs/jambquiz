-- 007: recovery flow columns + delete-cascade fixes.
-- Firebase adminDeleteStudent removes the student's payments/ledger too,
-- so CASCADE (the previous SET NULL on NOT NULL columns would error).
ALTER TABLE students ADD COLUMN IF NOT EXISTS recovery_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_recovery_attempt TIMESTAMPTZ;
ALTER TABLE students ADD COLUMN IF NOT EXISTS appealed_at TIMESTAMPTZ;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_student_id_fkey;
ALTER TABLE payments ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE payments
  ADD CONSTRAINT payments_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE;

ALTER TABLE coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_student_id_fkey;
ALTER TABLE coin_ledger
  ADD CONSTRAINT coin_ledger_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE;
