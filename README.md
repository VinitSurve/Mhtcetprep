# CETRanker – MAH MCA CET Practice & Rank Improvement System

> Production-grade PWA with authentication, adaptive learning, exam simulation, and deep analytics.  
> Built for sharing with 300–400 users.

---

## 📁 Project Structure

```
cetranker/
├── auth_migration.sql          ← Run this AFTER schema.sql (adds auth + RLS)
├── schema.sql                  ← Base tables, indexes, views
├── all_300_questions.sql       ← 300 real MAH MCA CET PYQs (2023–2025)
├── .env.example
├── vite.config.js
├── vercel.json
└── src/
    ├── contexts/
    │   └── AuthContext.jsx     ← Auth state, signIn, signUp, signOut, Google OAuth
    ├── pages/
    │   ├── Login.jsx           ← Email+password + Google OAuth + rate limiting
    │   ├── Home.jsx            ← Dashboard with user greeting
    │   ├── Practice.jsx        ← Practice / Adaptive mode
    │   ├── Exam.jsx            ← 100-question full simulation
    │   ├── SpeedMode.jsx       ← 30s-per-question speed drill
    │   ├── Analytics.jsx       ← 10-section analytics dashboard
    │   ├── MistakeBank.jsx     ← Retry wrong answers
    │   ├── HighFreq.jsx        ← PYQ mode (2023–2025 papers)
    │   └── NotFound.jsx
    ├── components/
    │   ├── AppHeader.jsx       ← Shared header with user avatar + logout
    │   ├── ProtectedRoute.jsx  ← Auth guard, redirects to /login
    │   ├── QuestionCard.jsx
    │   ├── Timer.jsx
    │   ├── ProgressBar.jsx
    │   ├── ConfidenceModal.jsx
    │   └── NavigationPanel.jsx
    ├── lib/
    │   └── supabase.js         ← All DB calls, user_id on every insert
    └── utils/
        ├── adaptiveEngine.js   ← Adaptive engine + 10 analytics functions
        ├── helpers.js
        ├── rateLimiter.js      ← Token-bucket rate limiter
        └── sanitize.js         ← Input validation, SQL injection notes
```

---

## 🚀 Setup (in order)

### STEP 1 — Create Supabase project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Click **New Project** → name it `cetranker`, pick Singapore region
3. Wait ~2 minutes for provisioning

---

### STEP 2 — Run SQL (3 files, in order)

In Supabase → **SQL Editor**, run each file as a separate query:

**2a. Base schema**
```
Paste → schema.sql → Run
```
Creates `questions`, `attempts`, `sessions` tables, all indexes, `topic_performance` and `subject_performance` views.

**2b. Auth migration**
```
Paste → auth_migration.sql → Run
```
Adds `user_id` to `attempts` and `sessions`, drops open policies, creates per-user RLS policies. Every user can only see their own data.

**2c. Load all 300 questions**
```
Paste → all_300_questions.sql → Run
```
Inserts 300 real MAH MCA CET questions from 2023, 2024, and 2025 solved papers.

Verify:
```sql
SELECT subject, COUNT(*) FROM questions GROUP BY subject ORDER BY count DESC;
```

---

### STEP 3 — Enable Email Auth

1. Supabase → **Authentication → Providers**
2. **Email** should be enabled by default
3. For production (300–400 users), go to **Auth → Rate Limits** and set appropriate limits

---

### STEP 4 — Enable Google OAuth (optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com) → Create OAuth 2.0 credentials
2. Authorized redirect URI: `https://your-project-ref.supabase.co/auth/v1/callback`
3. Supabase → **Authentication → Providers → Google** → paste Client ID + Secret
4. No extra `.env` vars needed — Supabase handles the redirect

---

### STEP 5 — Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON=your-anon-public-key-here
```

---

### STEP 6 — Run locally

```bash
npm install
npm run dev
# Opens at http://localhost:5173
```

---

### STEP 7 — Deploy to Vercel

```bash
npm run build          # verify build passes first
npx vercel             # follow prompts
```

Or via Vercel Dashboard:
1. Push to GitHub
2. Import repository at vercel.com
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON` as environment variables
4. Deploy

The `vercel.json` handles SPA routing, PWA service-worker headers, and security headers automatically.

---

## 🔐 Security Overview

| Layer | Protection |
|---|---|
| **Authentication** | Supabase Auth — email+password + Google OAuth |
| **Row-Level Security** | Every `attempts` and `sessions` row has `user_id`. RLS policies enforce `auth.uid() = user_id` on all reads and writes. No user can see another user's data. |
| **Questions** | Read-only for all authenticated users. No client can insert/update/delete questions. |
| **SQL Injection** | Not possible — all queries use Supabase JS parameterized PostgREST calls (`.eq()`, `.in()`, `.insert()`, etc.). No raw SQL is constructed anywhere in the frontend. |
| **Client Rate Limiting** | `rateLimiter.js` — auth: 5 attempts/60s, fetches: 60/60s, inserts: 120/60s |
| **Supabase built-in** | Supabase Auth has its own server-side rate limiting on login/signup endpoints |
| **Input Validation** | `sanitize.js` validates email format, password length (8–128 chars), display name (1–50 chars), strips null bytes and control characters |
| **XSS** | React JSX auto-escapes all rendered content |

---

## ✅ Pre-Launch Validation (One-Pass)

### 1) RLS verification

1. Run [docs/security/rls-verification.sql](docs/security/rls-verification.sql) in Supabase SQL Editor.
2. Follow [docs/security/rls-checklist.md](docs/security/rls-checklist.md) API isolation tests with two users.
3. Confirm cross-user read/write attempts are denied.

### 2) Load testing with k6

Install k6 on your machine and verify:

```bash
k6 version
```

Web smoke:

```bash
BASE_URL=https://your-staging-domain npm run load:smoke
```

Web peak profile (200 sustained + 400 spike):

```bash
BASE_URL=https://your-staging-domain npm run load:peak
```

Supabase API profile:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co \
SUPABASE_ANON_KEY=your-anon-key \
TEST_EMAIL=load-test-user@example.com \
TEST_PASSWORD=your-password \
npm run load:supabase
```

Optional write-path stress:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co \
SUPABASE_ANON_KEY=your-anon-key \
TEST_EMAIL=load-test-user@example.com \
TEST_PASSWORD=your-password \
ENABLE_WRITES=true TEST_QUESTION_ID=1 \
npm run load:supabase
```

Use the go/no-go criteria listed in [docs/security/rls-checklist.md](docs/security/rls-checklist.md).

---

## 📊 Analytics Dashboard — 10 Sections

1. **KPI Row** — Total attempts, accuracy, avg time, speed ratio, guess rate, confidence, current streak
2. **Predicted CET Score** — Based on recent 50 attempts with speed and difficulty adjustments (out of 200)
3. **Highlights** — Strongest / Weakest / Slowest topic with attempt counts
4. **Weekly Volume + Accuracy Trend** — Daily bar chart + line chart side by side
5. **Subject Accuracy** — Horizontal bars with per-subject colour coding
6. **Speed vs Accuracy Scatter** — Bubble chart per topic: identify fast-but-wrong vs slow-but-right
7. **Difficulty & Confidence** — Side-by-side bar charts
8. **Hourly Activity Heatmap** — 24-hour grid coloured by accuracy
9. **Topic Coverage** — How many of the 66 known topics you've attempted, broken down by subject
10. **Full Topic Table** — Sortable by accuracy, with Weak / Improving / Strong badges

---

## 🗄️ Database Schema

### `questions`
| Column | Type | Notes |
|---|---|---|
| id | serial PK | Auto-increment |
| question | text | Question text |
| options | jsonb | `{"A":"…","B":"…","C":"…","D":"…"}` |
| correct_answer | text | `"A"` \| `"B"` \| `"C"` \| `"D"` |
| subject | text | Mathematics / Computer Concepts / Logical Reasoning / English / General Aptitude |
| topic | text | e.g. Probability, SQL, Blood Relations |
| difficulty | text | Easy / Medium / Hard |
| expected_time_sec | int | Per-question target time |
| explanation | text | Answer explanation |
| is_repeated | boolean | Appeared in multiple years |
| frequency_count | int | How many times seen in exams |

### `attempts`
All columns from schema + `user_id UUID` (FK → `auth.users`).  
`speed_ratio` is a generated column: `time_taken_sec / expected_time_sec`.

### `sessions`
All columns from schema + `user_id UUID` (FK → `auth.users`).

---

## 🐛 Troubleshooting

| Problem | Solution |
|---|---|
| "No questions found" | Run `all_300_questions.sql` in Supabase SQL editor |
| Login not working | Make sure Email provider is enabled in Supabase Auth settings |
| "new row violates RLS policy" | Run `auth_migration.sql` — old open policies need to be dropped first |
| Google OAuth redirect error | Set authorized redirect URI in Google Cloud Console to `https://your-ref.supabase.co/auth/v1/callback` |
| Charts don't appear | Need at least 2 attempts. Speed/Accuracy scatter needs 2 per topic. |
| Predicted score shows N/A | Need minimum 10 attempts |
| Rate limit message on login | Wait 60 seconds — 5 attempts per minute limit |
| PWA not installing | Must be served over HTTPS (Vercel/Netlify handles this) |

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 |
| Styling | Tailwind CSS (CDN) |
| Routing | React Router v6 |
| Charts | Recharts |
| Auth | Supabase Auth (email + Google OAuth) |
| Database | Supabase (PostgreSQL + PostgREST) |
| PWA | vite-plugin-pwa + Workbox |
| Deployment | Vercel |
| Fonts | Syne + JetBrains Mono + Inter Tight |
# Mhtcetprep
