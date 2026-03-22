import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173';

export const options = {
  vus: 10,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1200'],
  },
};

export default function () {
  const endpoints = ['/', '/login', '/health.json', '/manifest.webmanifest'];

  for (const path of endpoints) {
    const res = http.get(`${BASE_URL}${path}`, {
      headers: { Accept: 'text/html,application/json' },
      tags: { endpoint: path },
    });

    check(res, {
      'status is 200': (r) => r.status === 200,
    });
  }

  sleep(1);
}
