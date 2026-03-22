-- ============================================================
-- CETRanker – MAH MCA CET Practice & Rank Improvement System
-- PostgreSQL Schema for Supabase
-- ============================================================

-- ──────────────────────────────────────────────
-- TABLES
-- ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS questions (
  id                  SERIAL PRIMARY KEY,
  question            TEXT NOT NULL,
  options             JSONB NOT NULL,   -- { "A": "...", "B": "...", "C": "...", "D": "..." }
  correct_answer      TEXT NOT NULL,    -- "A" | "B" | "C" | "D"
  subject             TEXT NOT NULL,
  topic               TEXT NOT NULL,
  question_subtype    TEXT,
  difficulty          TEXT NOT NULL CHECK (difficulty IN ('Easy','Medium','Hard')),
  expected_time_sec   INT  NOT NULL DEFAULT 60,
  explanation         TEXT,
  is_repeated         BOOLEAN NOT NULL DEFAULT FALSE,
  frequency_count     INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS attempts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id         INT  REFERENCES questions(id) ON DELETE CASCADE,
  selected_answer     TEXT,
  is_correct          BOOLEAN NOT NULL,
  time_taken_sec      INT  NOT NULL,
  expected_time_sec   INT  NOT NULL,
  speed_ratio         FLOAT GENERATED ALWAYS AS (
                        CASE WHEN expected_time_sec = 0 THEN NULL
                             ELSE time_taken_sec::FLOAT / expected_time_sec END
                      ) STORED,
  subject             TEXT NOT NULL,
  topic               TEXT NOT NULL,
  question_subtype    TEXT,
  difficulty          TEXT,
  attempt_number      INT  NOT NULL DEFAULT 1,
  confidence_level    INT  CHECK (confidence_level BETWEEN 1 AND 5),
  was_guess           BOOLEAN NOT NULL DEFAULT FALSE,
  error_type          TEXT,  -- 'concept', 'calculation', 'reading', 'silly', 'timeout'
  previous_correct    BOOLEAN,
  session_id          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_questions     INT  NOT NULL,
  correct_answers     INT  NOT NULL,
  total_time          INT  NOT NULL,  -- seconds
  mode                TEXT NOT NULL CHECK (mode IN ('practice','exam','speed','adaptive','mistake','highfreq')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- INDEXES (MANDATORY for performance)
-- ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_questions_topic            ON questions(topic);
CREATE INDEX IF NOT EXISTS idx_questions_subject          ON questions(subject);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty       ON questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_question_subtype ON questions(question_subtype);
CREATE INDEX IF NOT EXISTS idx_questions_is_repeated      ON questions(is_repeated);
CREATE INDEX IF NOT EXISTS idx_questions_frequency_count  ON questions(frequency_count DESC);

CREATE INDEX IF NOT EXISTS idx_attempts_question_id       ON attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_attempts_topic             ON attempts(topic);
CREATE INDEX IF NOT EXISTS idx_attempts_subject           ON attempts(subject);
CREATE INDEX IF NOT EXISTS idx_attempts_difficulty        ON attempts(difficulty);
CREATE INDEX IF NOT EXISTS idx_attempts_is_correct        ON attempts(is_correct);
CREATE INDEX IF NOT EXISTS idx_attempts_created_at        ON attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_session_id        ON attempts(session_id);

CREATE INDEX IF NOT EXISTS idx_sessions_mode              ON sessions(mode);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at        ON sessions(created_at DESC);

-- ──────────────────────────────────────────────
-- VIEWS (for analytics convenience)
-- ──────────────────────────────────────────────

CREATE OR REPLACE VIEW topic_performance AS
SELECT
  topic,
  subject,
  COUNT(*)                                          AS total_attempts,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)      AS correct_count,
  ROUND(AVG(CASE WHEN is_correct THEN 100.0 ELSE 0 END), 2) AS accuracy_pct,
  ROUND(AVG(time_taken_sec)::NUMERIC, 2)            AS avg_time_sec,
  ROUND(AVG(speed_ratio)::NUMERIC, 2)               AS avg_speed_ratio
FROM attempts
GROUP BY topic, subject;

CREATE OR REPLACE VIEW subject_performance AS
SELECT
  subject,
  COUNT(*)                                          AS total_attempts,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)      AS correct_count,
  ROUND(AVG(CASE WHEN is_correct THEN 100.0 ELSE 0 END), 2) AS accuracy_pct,
  ROUND(AVG(time_taken_sec)::NUMERIC, 2)            AS avg_time_sec
FROM attempts
GROUP BY subject;

-- ──────────────────────────────────────────────
-- ROW LEVEL SECURITY (Supabase – public read)
-- ──────────────────────────────────────────────

ALTER TABLE questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions   ENABLE ROW LEVEL SECURITY;

-- Allow public (anon) reads on questions
CREATE POLICY "Public read questions" ON questions
  FOR SELECT USING (true);

-- Allow anon insert/select on attempts and sessions (no auth)
CREATE POLICY "Public insert attempts" ON attempts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read attempts" ON attempts
  FOR SELECT USING (true);

CREATE POLICY "Public insert sessions" ON sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read sessions" ON sessions
  FOR SELECT USING (true);
