-- ==============================================================
-- CETRanker – Adaptive Engine Migration (V1)
-- Adds question weightage + tags model + user tag performance cache.
-- Safe to run multiple times.
-- ==============================================================

-- 1) Question weightage (1-5)
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS weightage INT NOT NULL DEFAULT 3;

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS questions_weightage_check;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_weightage_check
  CHECK (weightage BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS idx_questions_weightage
  ON public.questions(weightage DESC);

-- 2) Tags model
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.question_tags (
  question_id INT NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (question_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_question_tags_tag_question
  ON public.question_tags(tag_id, question_id);

-- Bootstrap tags from topic for existing data.
INSERT INTO public.tags (name)
SELECT DISTINCT q.topic
FROM public.questions q
WHERE q.topic IS NOT NULL AND q.topic <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.question_tags (question_id, tag_id)
SELECT q.id, t.id
FROM public.questions q
JOIN public.tags t ON t.name = q.topic
ON CONFLICT (question_id, tag_id) DO NOTHING;

-- 3) User tag performance cache table
CREATE TABLE IF NOT EXISTS public.user_tag_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  correct INT NOT NULL DEFAULT 0,
  avg_time_sec INT NOT NULL DEFAULT 0,
  accuracy NUMERIC(5,2) NOT NULL DEFAULT 0,
  weakness_score NUMERIC(7,4) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_user_tag_performance_user_weakness
  ON public.user_tag_performance(user_id, weakness_score DESC);

-- 4) RLS and policies for user_tag_performance
ALTER TABLE public.user_tag_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tag_performance FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own tag performance" ON public.user_tag_performance;
DROP POLICY IF EXISTS "Users read own tag performance" ON public.user_tag_performance;
DROP POLICY IF EXISTS "Users update own tag performance" ON public.user_tag_performance;

CREATE POLICY "Users insert own tag performance"
  ON public.user_tag_performance
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own tag performance"
  ON public.user_tag_performance
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own tag performance"
  ON public.user_tag_performance
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON TABLE public.user_tag_performance FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_tag_performance TO authenticated;
