-- 018: renewal nudges for students whose access has lapsed.
--
-- Kept separate from notification_state: that table drives the key-point
-- rotation and only ever holds the students the content pass targets, while
-- this one tracks a short re-engagement campaign per student.
CREATE TABLE IF NOT EXISTS renewal_nudges (
  student_id    TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  first_sent_at TIMESTAMPTZ NOT NULL,
  last_sent_at  TIMESTAMPTZ NOT NULL,
  sent_count    INTEGER NOT NULL DEFAULT 0
);
