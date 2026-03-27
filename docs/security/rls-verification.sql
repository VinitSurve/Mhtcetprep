-- RLS verification pack for Supabase SQL Editor
-- Run on STAGING first.

-- 1) Confirm RLS is enabled on target tables
SELECT
  schemaname,
  tablename,
  rowsecurity,
  relforcerowsecurity
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
WHERE t.schemaname = 'public'
  AND t.tablename IN ('questions', 'attempts', 'sessions', 'formula_progress', 'user_tag_performance')
ORDER BY t.tablename;

-- 2) Confirm expected policies exist
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('questions', 'attempts', 'sessions', 'formula_progress', 'user_tag_performance')
ORDER BY tablename, cmd, policyname;

-- 3) Confirm user_id columns exist and are indexed
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('attempts', 'sessions')
  AND column_name = 'user_id';

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('attempts', 'sessions')
  AND indexname IN ('idx_attempts_user_id', 'idx_sessions_user_id')
ORDER BY tablename, indexname;

-- 4) Sanity check: table grants should not allow unsafe writes to anon
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('questions', 'attempts', 'sessions', 'formula_progress', 'user_tag_performance')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

-- 4b) Hard fail query: this should return ZERO rows.
-- If rows appear, your grants are overly permissive.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('questions', 'attempts', 'sessions', 'formula_progress', 'user_tag_performance')
  AND (
    (grantee = 'anon' AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')) OR
    (grantee = 'authenticated' AND table_name = 'questions' AND privilege_type <> 'SELECT') OR
    (grantee = 'authenticated' AND table_name IN ('attempts', 'sessions', 'formula_progress', 'user_tag_performance') AND privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE'))
  )
ORDER BY table_name, grantee, privilege_type;

-- 4c) Remediation SQL (run if 4b returns rows)
-- REVOKE ALL ON TABLE public.questions FROM anon, authenticated;
-- REVOKE ALL ON TABLE public.attempts  FROM anon, authenticated;
-- REVOKE ALL ON TABLE public.sessions  FROM anon, authenticated;
-- REVOKE ALL ON TABLE public.formula_progress FROM anon, authenticated;
-- GRANT SELECT ON TABLE public.questions TO authenticated;
-- GRANT SELECT, INSERT ON TABLE public.attempts TO authenticated;
-- GRANT SELECT, INSERT ON TABLE public.sessions TO authenticated;
-- GRANT SELECT, INSERT, UPDATE ON TABLE public.formula_progress TO authenticated;

-- 5) Optional cleanup query for load tests when ENABLE_WRITES=true
-- Delete rows created by load test topic marker.
-- DELETE FROM public.attempts WHERE topic = 'LoadTest' AND subject = 'LoadTest';
