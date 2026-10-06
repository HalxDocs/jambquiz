-- 001: identity + people. IDs are TEXT (app-generated) so Firestore
-- doc IDs backfill 1:1 later. Money is integer NGN, no floats.

CREATE TABLE IF NOT EXISTS students (
  id                 TEXT PRIMARY KEY,
  uid                TEXT UNIQUE,
  password_hash      TEXT NOT NULL DEFAULT '',
  name               TEXT NOT NULL,
  name_lower         TEXT NOT NULL,
  name_lower_words   TEXT[] NOT NULL DEFAULT '{}',
  nickname           TEXT NOT NULL DEFAULT '',
  nickname_lower     TEXT NOT NULL DEFAULT '',
  year               TEXT NOT NULL DEFAULT '',
  email              TEXT NOT NULL DEFAULT '',
  phone              TEXT NOT NULL DEFAULT '',
  parent_phone       TEXT NOT NULL DEFAULT '',
  teacher_phone      TEXT NOT NULL DEFAULT '',
  subjects           TEXT[] NOT NULL DEFAULT '{}',
  squad              TEXT[] NOT NULL DEFAULT '{}',
  referred_by        TEXT NOT NULL DEFAULT '',
  referral_no        TEXT,
  role               TEXT NOT NULL DEFAULT 'student',
  subscription_until TIMESTAMPTZ,
  free_attempts_used INTEGER NOT NULL DEFAULT 0,
  trial_started_at   TIMESTAMPTZ,
  joined_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspended          BOOLEAN NOT NULL DEFAULT FALSE,
  missed_streak      INTEGER NOT NULL DEFAULT 0,
  recovery_code      TEXT,
  coins              INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_students_uid ON students (uid);
CREATE INDEX IF NOT EXISTS idx_students_name_lower ON students (name_lower);
CREATE INDEX IF NOT EXISTS idx_students_year ON students (year);
CREATE INDEX IF NOT EXISTS idx_students_teacher_phone ON students (teacher_phone);

-- Public friend-search profile (safe subset, no uid/secrets).
CREATE TABLE IF NOT EXISTS student_profiles (
  student_id       TEXT PRIMARY KEY REFERENCES students (id) ON DELETE CASCADE,
  name             TEXT NOT NULL DEFAULT '',
  nickname         TEXT NOT NULL DEFAULT '',
  name_lower_words TEXT[] NOT NULL DEFAULT '{}',
  nickname_lower   TEXT NOT NULL DEFAULT '',
  year             TEXT NOT NULL DEFAULT '',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teachers (
  id                     TEXT PRIMARY KEY,
  uid                    TEXT UNIQUE,
  password_hash          TEXT NOT NULL DEFAULT '',
  name                   TEXT NOT NULL,
  email                  TEXT UNIQUE,
  phone                  TEXT NOT NULL UNIQUE,
  account_number         TEXT NOT NULL DEFAULT '',
  bank_name              TEXT NOT NULL DEFAULT '',
  is_pioneer             BOOLEAN NOT NULL DEFAULT FALSE,
  pioneer_code           TEXT UNIQUE,
  referred_by_pioneer_id TEXT REFERENCES teachers (id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teacher_otps (
  phone      TEXT PRIMARY KEY,
  code       TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pioneer_codes (
  code       TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES teachers (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
