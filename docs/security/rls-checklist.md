# RLS Verification Checklist and Go/No-Go Gates

Use this checklist on staging, then repeat on production before broad release.

## Preconditions

1. `auth_migration.sql` has been executed on the target Supabase project.
2. You have two test users with confirmed emails:
- User A: `TEST_EMAIL`
- User B: `TEST_EMAIL_B`
3. You have access tokens for both users.

## Token Retrieval (REST)

Get User A token:

```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"'$TEST_EMAIL'","password":"'$TEST_PASSWORD'"}'
```

Get User B token:

```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"'$TEST_EMAIL_B'","password":"'$TEST_PASSWORD_B'"}'
```

Save the `access_token` values as `TOKEN_A` and `TOKEN_B`.

## SQL Verification

Run [docs/security/rls-verification.sql](docs/security/rls-verification.sql) in Supabase SQL Editor.

Pass conditions:

1. `rowsecurity = true` for `questions`, `attempts`, `sessions`, `formula_progress`, and `user_tag_performance`.
2. Policies include:
- authenticated read questions
- users insert own attempts
- users read own attempts
- users insert own sessions
- users read own sessions
- users insert/read/update own formula progress
- users insert/read/update own user tag performance
3. `user_id` exists on `attempts` and `sessions`, and both user_id indexes exist.
4. Query 4b in [docs/security/rls-verification.sql](docs/security/rls-verification.sql) returns zero rows.

## API Isolation Tests (must pass)

### 1) User A writes one attempt as self (expected success)

```bash
curl -i -X POST "$SUPABASE_URL/rest/v1/attempts" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '[{
    "question_id": 1,
    "selected_answer": "A",
    "is_correct": false,
    "time_taken_sec": 30,
    "expected_time_sec": 60,
    "subject": "RLS_TEST",
    "topic": "RLS_TEST",
    "difficulty": "Easy",
    "session_id": "22222222-2222-2222-2222-222222222222",
    "user_id": "USER_A_UUID"
  }]'
```

Expected:
- `201` and inserted row returned.

### 2) User A tries to write row for User B (expected fail)

```bash
curl -i -X POST "$SUPABASE_URL/rest/v1/attempts" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '[{
    "question_id": 1,
    "selected_answer": "A",
    "is_correct": false,
    "time_taken_sec": 30,
    "expected_time_sec": 60,
    "subject": "RLS_TEST",
    "topic": "RLS_TEST",
    "difficulty": "Easy",
    "session_id": "33333333-3333-3333-3333-333333333333",
    "user_id": "USER_B_UUID"
  }]'
```

Expected:
- `401/403` or policy violation error.

### 3) User A reads attempts and confirms only own rows

```bash
curl -s "$SUPABASE_URL/rest/v1/attempts?select=id,user_id,topic,created_at&order=created_at.desc&limit=20" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $TOKEN_A"
```

Expected:
- Every row has `user_id = USER_A_UUID`.

### 4) User B reads attempts and confirms user isolation

```bash
curl -s "$SUPABASE_URL/rest/v1/attempts?select=id,user_id,topic,created_at&order=created_at.desc&limit=20" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $TOKEN_B"
```

Expected:
- Every row has `user_id = USER_B_UUID`.
- User B cannot see User A rows.

## Load-Test Runbook (k6)

Install k6 first:

```bash
k6 version
```

Run web smoke:

```bash
BASE_URL=https://your-staging-domain k6 run load-tests/k6/smoke.js
```

Run web peak profile (200 sustained + 400 spike):

```bash
BASE_URL=https://your-staging-domain k6 run load-tests/k6/app-peak.js
```

Run Supabase API profile (read-only by default):

```bash
SUPABASE_URL=https://your-project-ref.supabase.co \
SUPABASE_ANON_KEY=your-anon-key \
TEST_EMAIL=load-test-user@example.com \
TEST_PASSWORD=your-password \
k6 run load-tests/k6/supabase-api.js
```

Optional write path test:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co \
SUPABASE_ANON_KEY=your-anon-key \
TEST_EMAIL=load-test-user@example.com \
TEST_PASSWORD=your-password \
ENABLE_WRITES=true TEST_QUESTION_ID=1 \
k6 run load-tests/k6/supabase-api.js
```

## Go/No-Go Criteria

Go:

1. All SQL verification checks pass.
2. Cross-user write attempt fails by policy.
3. Cross-user read isolation is confirmed.
4. k6 web peak test has:
- `http_req_failed < 2%`
- `p95 < 1.5s`
- `p99 < 3.0s`
5. k6 Supabase API test has:
- `http_req_failed < 2%`
- `p95 < 1.2s`
- no persistent 5xx bursts

No-Go:

1. Any cross-user read/write test succeeds unexpectedly.
2. RLS disabled on any protected table.
3. Any load test exceeds error budget for more than 5 minutes.
4. Grant check query 4b returns any unsafe privileges.
