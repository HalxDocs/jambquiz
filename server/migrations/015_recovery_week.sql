-- 015: post-migration recovery week.
--
-- Three problems left every legacy student unable to test:
--   1. 118 students carried a stale `suspended` flag written by the Firebase
--      missed-streak cron, which froze at cutover. access.For checks suspension
--      before subscription, so these accounts were refused even when paid.
--   2. Everyone's Firebase Auth password was un-migratable, so 195 students
--      cannot sign in until they reset.
--   3. Trial windows (14 days) had expired for the rest of the cohort.
--
-- This migration clears the stale suspensions and grants everyone a free week
-- of access so the legacy cohort can actually sit a test. Resetting
-- missed_streak is required: leave it at 6 and the next cron run re-suspends
-- them immediately, undoing this.

-- 1. Clear frozen Firebase-era suspensions.
UPDATE students SET suspended = false, missed_streak = 0 WHERE suspended = true;

-- 2. Free week for every student. GREATEST ignores NULLs and keeps any paid
--    time that already runs past the free week, so nobody loses subscription.
UPDATE students
SET subscription_until = GREATEST(subscription_until, now() + interval '7 days')
WHERE role = 'student';

-- 3. Eight students registered without subjects, which makes
--    startQuiz return ErrNoSubjects with no way forward. Give them the most
--    common combination; they can change it from their dashboard.
UPDATE students
SET subjects = ARRAY['Mathematics', 'Physics', 'Chemistry', 'English Language']
WHERE role = 'student' AND (subjects IS NULL OR cardinality(subjects) = 0);