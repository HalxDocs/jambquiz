-- 002: quiz engine. Answer key lives apart from public questions,
-- same split as Firestore (questions / questionAnswers).

CREATE TABLE IF NOT EXISTS questions (
  id                TEXT PRIMARY KEY,
  subject           TEXT NOT NULL,
  week              TEXT NOT NULL,
  question          TEXT NOT NULL,
  options           JSONB NOT NULL DEFAULT '[]',
  explanation       TEXT NOT NULL DEFAULT '',
  image             TEXT NOT NULL DEFAULT '',
  option_images     JSONB NOT NULL DEFAULT '[]',
  explanation_image TEXT NOT NULL DEFAULT '',
  video_url         TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_questions_subject_week ON questions (subject, week);

CREATE TABLE IF NOT EXISTS question_answers (
  question_id TEXT PRIMARY KEY REFERENCES questions (id) ON DELETE CASCADE,
  answer      INTEGER NOT NULL CHECK (answer BETWEEN 0 AND 3)
);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id          TEXT PRIMARY KEY,
  uid         TEXT NOT NULL,
  student_id  TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  week        TEXT NOT NULL,
  is_retake   BOOLEAN NOT NULL DEFAULT FALSE,
  assignments JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'started',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline    TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_student ON quiz_sessions (student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status_deadline ON quiz_sessions (status, deadline);

CREATE TABLE IF NOT EXISTS scores (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  uid          TEXT NOT NULL DEFAULT '',
  student_name TEXT NOT NULL DEFAULT '',
  subject      TEXT NOT NULL,
  week         TEXT NOT NULL,
  score        INTEGER NOT NULL DEFAULT 0,
  out_of       INTEGER NOT NULL DEFAULT 100,
  correct      INTEGER NOT NULL DEFAULT 0,
  wrong        INTEGER NOT NULL DEFAULT 0,
  unanswered   INTEGER NOT NULL DEFAULT 0,
  total        INTEGER NOT NULL DEFAULT 0,
  is_retake    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scores_student ON scores (student_id);
CREATE INDEX IF NOT EXISTS idx_scores_week ON scores (week);
CREATE INDEX IF NOT EXISTS idx_scores_subject_week_score ON scores (subject, week, score DESC);

-- Collapsed per-student-week details (answers, no answer key).
CREATE TABLE IF NOT EXISTS score_details (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  uid        TEXT NOT NULL DEFAULT '',
  week       TEXT NOT NULL,
  subjects   JSONB NOT NULL DEFAULT '[]',
  answers    JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, week)
);
CREATE INDEX IF NOT EXISTS idx_score_details_student ON score_details (student_id);

CREATE TABLE IF NOT EXISTS topics (
  week       TEXT PRIMARY KEY,
  topics     JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS question_limits (
  id      TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  week    TEXT NOT NULL,
  "limit" INTEGER NOT NULL CHECK ("limit" BETWEEN 1 AND 200),
  UNIQUE (subject, week)
);

-- Schemaless settings (activeWeek, quizDates_*, ...): key -> JSON doc.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  data       JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
