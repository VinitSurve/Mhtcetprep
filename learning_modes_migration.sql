-- ==============================================================
-- CETRanker – Learning Modes Migration
-- Run this AFTER auth_migration.sql
-- Adds Formula/Application + Subject Mastery + Smart Revision support.
-- ============================================================== 

-- 1) Extend questions metadata
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS formula TEXT,
  ADD COLUMN IF NOT EXISTS concept TEXT;

CREATE INDEX IF NOT EXISTS idx_questions_formula
  ON public.questions(formula)
  WHERE formula IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_questions_concept
  ON public.questions(concept)
  WHERE concept IS NOT NULL;

-- 2) Extend sessions with subject and new mode values
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS subject TEXT;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_mode_check;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_mode_check
  CHECK (mode IN (
    'practice','exam','speed','adaptive','mistake','highfreq',
    'formula','mastery','revision'
  ));

-- Backfill session subject from most recent attempt in the same session.
UPDATE public.sessions s
SET subject = sub.subject
FROM (
  SELECT DISTINCT ON (a.session_id)
    a.session_id,
    a.subject
  FROM public.attempts a
  WHERE a.session_id IS NOT NULL
  ORDER BY a.session_id, a.created_at DESC
) sub
WHERE s.id = sub.session_id
  AND s.subject IS NULL;

-- Fallback for sessions without linked attempts.
UPDATE public.sessions
SET subject = 'General Aptitude'
WHERE subject IS NULL;

ALTER TABLE public.sessions
  ALTER COLUMN subject SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_subject
  ON public.sessions(subject);

-- 3) Formula progress table
CREATE TABLE IF NOT EXISTS public.formula_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  formula TEXT NOT NULL,
  topic TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  correct INT NOT NULL DEFAULT 0,
  avg_time INT NOT NULL DEFAULT 0,
  last_practiced TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, formula)
);

CREATE INDEX IF NOT EXISTS idx_formula_progress_user
  ON public.formula_progress(user_id);

CREATE INDEX IF NOT EXISTS idx_formula_progress_topic
  ON public.formula_progress(topic);

ALTER TABLE public.formula_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formula_progress FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own formula progress" ON public.formula_progress;
DROP POLICY IF EXISTS "Users read own formula progress" ON public.formula_progress;
DROP POLICY IF EXISTS "Users update own formula progress" ON public.formula_progress;

CREATE POLICY "Users insert own formula progress"
  ON public.formula_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own formula progress"
  ON public.formula_progress
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own formula progress"
  ON public.formula_progress
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON TABLE public.formula_progress FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.formula_progress TO authenticated;

-- 4) Verification helpers
-- SELECT tablename, rowsecurity, relforcerowsecurity
-- FROM pg_tables t
-- JOIN pg_class c ON c.relname = t.tablename
-- JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
-- WHERE t.schemaname='public' AND t.tablename IN ('questions','sessions','formula_progress');
