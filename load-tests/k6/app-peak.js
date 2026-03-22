import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173';

export const options = {
  scenarios: {
    sustained_200: {
      executor: 'constant-vus',
      vus: 200,
      duration: '10m',
      exec: 'webFlow',
    },
    spike_400: {
      executor: 'ramping-vus',
      startTime: '10m',
      stages: [
        { duration: '2m', target: 200 },
        { duration: '3m', target: 400 },
        { duration: '2m', target: 200 },
        { duration: '1m', target: 50 },
      ],
      exec: 'webFlow',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    checks: ['rate>0.98'],
  },
};

const endpoints = [
  '/login',
  '/',
  '/practice',
  '/analytics',
  '/health.json',
  '/manifest.webmanifest',
];

export function webFlow() {
  const path = endpoints[Math.floor(Math.random() * endpoints.length)];
  const res = http.get(`${BASE_URL}${path}`, {
    headers: { Accept: 'text/html,application/json' },
    tags: { endpoint: path },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response under 3s': (r) => r.timings.duration < 3000,
  });

  sleep(Math.random() * 2 + 0.5);
}
