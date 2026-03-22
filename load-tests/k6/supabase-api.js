import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const TEST_EMAIL = __ENV.TEST_EMAIL;
const TEST_PASSWORD = __ENV.TEST_PASSWORD;
const ENABLE_WRITES = (__ENV.ENABLE_WRITES || 'false').toLowerCase() === 'true';
const TEST_QUESTION_ID = Number(__ENV.TEST_QUESTION_ID || '1');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEST_EMAIL || !TEST_PASSWORD) {
  fail('Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD');
}

export const options = {
  scenarios: {
    api_sustained: {
      executor: 'constant-vus',
      vus: 120,
      duration: '8m',
      exec: 'readAndOptionalWriteFlow',
    },
    api_spike: {
      executor: 'ramping-vus',
      startTime: '8m',
      stages: [
        { duration: '2m', target: 120 },
        { duration: '3m', target: 250 },
        { duration: '2m', target: 120 },
      ],
      exec: 'readAndOptionalWriteFlow',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1200', 'p(99)<2500'],
    checks: ['rate>0.98'],
  },
};

function authHeaders(accessToken) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

function authenticate() {
  const loginUrl = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const payload = JSON.stringify({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  const res = http.post(loginUrl, payload, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    tags: { endpoint: 'auth_login' },
  });

  check(res, {
    'auth status 200': (r) => r.status === 200,
    'has access token': (r) => !!r.json('access_token'),
  });

  if (res.status !== 200) {
    fail(`Auth failed with status ${res.status}: ${res.body}`);
  }

  return {
    accessToken: res.json('access_token'),
    userId: res.json('user.id'),
  };
}

export function setup() {
  return authenticate();
}

export function readAndOptionalWriteFlow(data) {
  const headers = authHeaders(data.accessToken);

  const qRes = http.get(
    `${SUPABASE_URL}/rest/v1/questions?select=id,subject,topic,difficulty&limit=20`,
    { headers, tags: { endpoint: 'questions_read' } }
  );

  check(qRes, {
    'questions read status 200': (r) => r.status === 200,
  });

  const aRes = http.get(
    `${SUPABASE_URL}/rest/v1/attempts?select=id,created_at,user_id&order=created_at.desc&limit=10`,
    { headers, tags: { endpoint: 'attempts_read' } }
  );

  check(aRes, {
    'attempts read status 200': (r) => r.status === 200,
  });

  if (ENABLE_WRITES) {
    const attemptPayload = {
      question_id: TEST_QUESTION_ID,
      selected_answer: 'A',
      is_correct: false,
      time_taken_sec: 35,
      expected_time_sec: 60,
      subject: 'LoadTest',
      topic: 'LoadTest',
      question_subtype: 'LoadTest',
      difficulty: 'Easy',
      confidence_level: 3,
      was_guess: false,
      error_type: 'loadtest',
      session_id: '11111111-1111-1111-1111-111111111111',
      user_id: data.userId,
    };

    const wRes = http.post(
      `${SUPABASE_URL}/rest/v1/attempts`,
      JSON.stringify(attemptPayload),
      {
        headers: {
          ...headers,
          Prefer: 'return=minimal',
        },
        tags: { endpoint: 'attempts_write' },
      }
    );

    check(wRes, {
      'attempt write status 201 or 204': (r) => r.status === 201 || r.status === 204,
    });
  }

  sleep(Math.random() * 1.2 + 0.2);
}
