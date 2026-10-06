-- 005: uniqueness needed by registration paths.
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_name_lower ON students (name_lower);
