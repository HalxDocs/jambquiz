-- 016: optional passage/prompt text for comprehension questions.
--
-- English Language and Literature in English need a passage or poem quoted
-- above the question. Without a dedicated column the only way to do it was to
-- paste the passage into the question text, which breaks the 1-hour reading
-- budget, cannot be styled, and has to be retyped for every follow-up question
-- drawn from the same passage.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS passage TEXT NOT NULL DEFAULT '';