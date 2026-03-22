-- ==============================================================
-- CETRanker – Authentication Migration
-- Run this in Supabase SQL Editor BEFORE deploying the auth update
-- ==============================================================

-- ── 1. Add user_id to attempts ────────────────────────────────
ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_attempts_user_id
  ON public.attempts(user_id);

-- ── 2. Add user_id to sessions ────────────────────────────────
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
  ON public.sessions(user_id);

-- ── 3. Add display_name to auth user metadata (optional) ──────
-- Users set this on registration via supabase.auth.signUp options.
-- No schema change needed — it lives in auth.users.raw_user_meta_data.

-- ── 4. Enable RLS on all tables ───────────────────────────────
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions  ENABLE ROW LEVEL SECURITY;

-- ── 5. Drop any old open policies ─────────────────────────────
DROP POLICY IF EXISTS "Public read questions"    ON public.questions;
DROP POLICY IF EXISTS "Public insert attempts"   ON public.attempts;
DROP POLICY IF EXISTS "Public read attempts"     ON public.attempts;
DROP POLICY IF EXISTS "Public insert sessions"   ON public.sessions;
DROP POLICY IF EXISTS "Public read sessions"     ON public.sessions;

-- ── 6. Questions — authenticated read, no writes from client ──
CREATE POLICY "Authenticated users can read questions"
  ON public.questions
  FOR SELECT
  TO authenticated
  USING (true);

-- ── 7. Attempts — per-user isolation ──────────────────────────
CREATE POLICY "Users insert own attempts"
  ON public.attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own attempts"
  ON public.attempts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ── 8. Sessions — per-user isolation ──────────────────────────
CREATE POLICY "Users insert own sessions"
  ON public.sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own sessions"
  ON public.sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ── 9. Recreate views to work with RLS ────────────────────────
-- Views run with the security of the calling user, so RLS on
-- the underlying tables automatically scopes them per user.
CREATE OR REPLACE VIEW public.topic_performance AS
SELECT
  topic,
  subject,
  COUNT(*)                                                        AS total_attempts,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)                    AS correct_count,
  ROUND(AVG(CASE WHEN is_correct THEN 100.0 ELSE 0 END), 2)      AS accuracy_pct,
  ROUND(AVG(time_taken_sec)::NUMERIC, 2)                         AS avg_time_sec,
  ROUND(AVG(speed_ratio)::NUMERIC, 2)                            AS avg_speed_ratio
FROM public.attempts
GROUP BY topic, subject;

CREATE OR REPLACE VIEW public.subject_performance AS
SELECT
  subject,
  COUNT(*)                                                        AS total_attempts,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)                    AS correct_count,
  ROUND(AVG(CASE WHEN is_correct THEN 100.0 ELSE 0 END), 2)      AS accuracy_pct,
  ROUND(AVG(time_taken_sec)::NUMERIC, 2)                         AS avg_time_sec
FROM public.attempts
GROUP BY subject;

-- ── 10. Rate-limit helper via pg function ─────────────────────
-- This function can be called from Edge Functions or RLS policies.
-- For now it's here as documentation; client-side rate limiting
-- handles the UI layer.

-- ── VERIFICATION ─────────────────────────────────────────────
-- SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE tablename IN ('questions','attempts','sessions')
--   ORDER BY tablename, cmd;
