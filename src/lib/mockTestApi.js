import { supabase } from './supabase';
import { insertSession } from './supabase';
import { fetchLimiter, insertLimiter, checkRateLimit } from '../utils/rateLimiter';

const DEFAULT_MOCK_COUNT = 10; // Default number of mock tests
const QUESTIONS_PER_MOCK = 100; // Questions per mock test

// List mock tests (latest first). Pass limit to cap results; omit to fetch all.
export async function fetchMockTests(limit) {
  checkRateLimit(fetchLimiter, 'mock_test_list', 'mock test fetches');
  const query = supabase
    .from('mock_tests')
    .select('id, name, duration_minutes, total_questions, created_at')
    .order('created_at', { ascending: false });
  if (limit) query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;

  const mocks = normalizeMockOrder(data || []);
  await backfillMockQuestions(mocks);
  if (mocks.length >= DEFAULT_MOCK_COUNT) return mocks;

  // Seed missing mock tests using the questions table (best effort)
  try {
    await seedMockTestsFromQuestions(DEFAULT_MOCK_COUNT - mocks.length, mocks.length);
    const { data: refreshed, error: refErr } = await query;
    if (refErr) throw refErr;
    return normalizeMockOrder(refreshed || mocks);
  } catch (e) {
    // If seeding fails (e.g., RLS), fall back to whatever we had
    console.warn('Mock seeding skipped:', e?.message || e);
    return mocks;
  }
}

function normalizeMockOrder(mocks) {
  const getNum = (name = '') => {
    const match = String(name).match(/(\d+)/);
    return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
  };

  return [...mocks].sort((a, b) => {
    const na = getNum(a?.name);
    const nb = getNum(b?.name);
    if (na !== nb) return na - nb;
    if (a?.created_at && b?.created_at) return new Date(a.created_at) - new Date(b.created_at);
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
}

function deduplicateMappingRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.mock_test_id}:${row.question_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function seedMockTestsFromQuestions(toCreate, existingCount) {
  if (toCreate <= 0) return;

  // Fetch a question pool once with subjects so we can balance distribution.
  const { data: allQuestions, error: qErr } = await supabase
    .from('questions')
    .select('id, subject')
    .order('id', { ascending: true });
  if (qErr) throw qErr;
  if (!allQuestions?.length) throw new Error('No questions available to seed mock tests.');

  // Group questions by subject for a simple round-robin spread.
  const bySubject = allQuestions.reduce((acc, row) => {
    const key = row.subject || 'General';
    if (!acc[key]) acc[key] = [];
    acc[key].push(row.id);
    return acc;
  }, {});
  const subjects = Object.keys(bySubject);
  const subjectPositions = Object.fromEntries(subjects.map((s) => [s, 0]));

  // Base even split across subjects; any remainder rotates by mock index for variety.
  const basePerSubject = Math.floor(QUESTIONS_PER_MOCK / subjects.length) || 1;
  const extrasPerMock = QUESTIONS_PER_MOCK - basePerSubject * subjects.length;

  const inserts = [];
  const mappings = [];

  for (let i = 0; i < toCreate; i += 1) {
    const idx = existingCount + i + 1;
    const name = `Mock ${idx}`;
    const batch = [];

    // Base allocation: even slice per subject.
    for (const subj of subjects) {
      const pool = bySubject[subj];
      for (let k = 0; k < basePerSubject; k += 1) {
        const pos = subjectPositions[subj] % pool.length;
        batch.push(pool[pos]);
        subjectPositions[subj] = (subjectPositions[subj] + 1) % pool.length;
      }
    }

    // Extras: rotate subjects so each mock gets a slightly different mix.
    for (let e = 0; e < extrasPerMock; e += 1) {
      const subj = subjects[(i + e) % subjects.length];
      const pool = bySubject[subj];
      const pos = subjectPositions[subj] % pool.length;
      batch.push(pool[pos]);
      subjectPositions[subj] = (subjectPositions[subj] + 1) % pool.length;
    }

    // If we undershoot (e.g., very few subjects), pad by cycling the global pool.
    while (batch.length < QUESTIONS_PER_MOCK) {
      const pos = (idx + batch.length) % allQuestions.length;
      batch.push(allQuestions[pos].id);
    }

    inserts.push({ name, duration_minutes: 90, total_questions: QUESTIONS_PER_MOCK });
    mappings.push(batch.slice(0, QUESTIONS_PER_MOCK));
  }

  checkRateLimit(insertLimiter, 'mock_seed_tests', 'mock seeds');
  const { data: created, error: insErr } = await supabase
    .from('mock_tests')
    .insert(inserts)
    .select('id');
  if (insErr) throw insErr;
  if (!created || created.length !== inserts.length) throw new Error('Mock creation mismatch');

  const mockIds = created.map((row, idx) => ({ mockId: row.id, questions: mappings[idx] }));
  const mappingRows = mockIds.flatMap(({ mockId, questions }) =>
    questions.map((qid, pos) => ({ mock_test_id: mockId, question_id: qid, position: pos + 1 }))
  );

  // Fresh mocks: clear any stray rows then insert.
  const seedIds = mockIds.map(m => m.mockId);
  const { error: seedDelErr } = await supabase.from('mock_test_questions').delete().in('mock_test_id', seedIds);
  if (seedDelErr) console.warn('Seed delete failed (RLS?):', seedDelErr.message);

  checkRateLimit(insertLimiter, 'mock_seed_questions', 'mock seeds');
  const { error: mapErr } = await supabase
    .from('mock_test_questions')
    .upsert(deduplicateMappingRows(mappingRows), { onConflict: 'mock_test_id,question_id' });
  if (mapErr) throw mapErr;
}

async function backfillMockQuestions(mocks) {
  if (!mocks.length) return;
  const ids = mocks.map(m => m.id).filter(Boolean);
  if (!ids.length) return;

  // Find mocks with zero questions mapped.
  const { data: rows, error } = await supabase
    .from('mock_test_questions')
    .select('mock_test_id, question_id')
    .in('mock_test_id', ids);
  if (error) {
    console.warn('Backfill check failed:', error.message);
    return;
  }

  const counts = rows?.reduce((acc, r) => {
    acc[r.mock_test_id] = (acc[r.mock_test_id] || 0) + 1;
    return acc;
  }, {}) || {};

  const needs = mocks.filter(m => (counts[m.id] || 0) === 0);
  if (!needs.length) return;

  // Reuse the same question pool and spread logic as seeding.
  const { data: allQuestions, error: qErr } = await supabase
    .from('questions')
    .select('id, subject')
    .order('id', { ascending: true });
  if (qErr || !allQuestions?.length) {
    console.warn('Backfill skipped (no questions):', qErr?.message || 'no rows');
    return;
  }

  const bySubject = allQuestions.reduce((acc, row) => {
    const key = row.subject || 'General';
    if (!acc[key]) acc[key] = [];
    acc[key].push(row.id);
    return acc;
  }, {});
  const subjects = Object.keys(bySubject);
  const subjectPositions = Object.fromEntries(subjects.map((s) => [s, 0]));
  const basePerSubject = Math.floor(QUESTIONS_PER_MOCK / subjects.length) || 1;
  const extrasPerMock = QUESTIONS_PER_MOCK - basePerSubject * subjects.length;

  const mappingRows = [];

  needs.forEach((mock, idx) => {
    const batch = [];

    for (const subj of subjects) {
      const pool = bySubject[subj];
      for (let k = 0; k < basePerSubject; k += 1) {
        const pos = subjectPositions[subj] % pool.length;
        batch.push(pool[pos]);
        subjectPositions[subj] = (subjectPositions[subj] + 1) % pool.length;
      }
    }

    for (let e = 0; e < extrasPerMock; e += 1) {
      const subj = subjects[(idx + e) % subjects.length];
      const pool = bySubject[subj];
      const pos = subjectPositions[subj] % pool.length;
      batch.push(pool[pos]);
      subjectPositions[subj] = (subjectPositions[subj] + 1) % pool.length;
    }

    while (batch.length < QUESTIONS_PER_MOCK) {
      const pos = (idx + batch.length) % allQuestions.length;
      batch.push(allQuestions[pos].id);
    }

    batch.slice(0, QUESTIONS_PER_MOCK).forEach((qid, pos) => {
      mappingRows.push({ mock_test_id: mock.id, question_id: qid, position: pos + 1 });
    });
  });

  if (!mappingRows.length) return;

  const targetIds = needs.map(n => n.id);
  const { error: backfillDelErr } = await supabase
    .from('mock_test_questions')
    .delete()
    .in('mock_test_id', targetIds);
  if (backfillDelErr) console.warn('Backfill delete failed (RLS?):', backfillDelErr.message);

  checkRateLimit(insertLimiter, 'mock_backfill_questions', 'mock seeds');
  const { error: mapErr } = await supabase
    .from('mock_test_questions')
    .upsert(deduplicateMappingRows(mappingRows), { onConflict: 'mock_test_id,question_id' });
  if (mapErr) console.warn('Backfill insert failed:', mapErr.message);
}

function normalizeSubtype(row) {
  return String(row?.question_subtype || '').toLowerCase();
}

function groupBySubject(rows) {
  return rows.reduce((acc, row) => {
    const key = row.subject || 'General';
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

function nextFromGroup(bySubject, subject, cursors, seen) {
  const pool = bySubject[subject];
  if (!pool?.length) return null;
  const max = pool.length;
  for (let i = 0; i < max; i += 1) {
    const pos = cursors[subject] % max;
    cursors[subject] = (pos + 1) % max;
    const cand = pool[pos];
    if (!seen.has(cand.id)) return cand;
  }
  return null;
}

async function buildBalancedQuestions(seedOffset = 0, preferFresh = true) {
  const { data: allQuestions, error: qErr } = await supabase
    .from('questions')
    .select('*')
    .order('id', { ascending: true });
  if (qErr) throw qErr;
  if (!allQuestions?.length) throw new Error('No questions available to build mock test.');

  const fresh = allQuestions.filter(q => normalizeSubtype(q) !== 'pyq');
  const primaryPool = preferFresh && fresh.length ? fresh : allQuestions;

  const primaryBySubject = groupBySubject(primaryPool);
  const fallbackBySubject = groupBySubject(allQuestions);

  const primarySubjects = Object.keys(primaryBySubject);
  const fallbackSubjects = Object.keys(fallbackBySubject);
  const subjects = primarySubjects.length ? primarySubjects : fallbackSubjects;

  const primaryCursors = Object.fromEntries(subjects.map((s) => [s, 0]));
  const fallbackCursors = Object.fromEntries(fallbackSubjects.map((s) => [s, 0]));
  const seen = new Set();

  const basePerSubject = Math.floor(QUESTIONS_PER_MOCK / subjects.length) || 1;
  const extrasPerMock = QUESTIONS_PER_MOCK - basePerSubject * subjects.length;

  const batch = [];

  // Evenly spread across subjects using fresh pool first.
  for (const subj of subjects) {
    for (let k = 0; k < basePerSubject; k += 1) {
      let picked = nextFromGroup(primaryBySubject, subj, primaryCursors, seen);
      if (!picked) picked = nextFromGroup(fallbackBySubject, subj, fallbackCursors, seen);
      if (picked) {
        seen.add(picked.id);
        batch.push(picked);
      }
    }
  }

  // Extras distributed round-robin with same preference order.
  for (let e = 0; e < extrasPerMock; e += 1) {
    const subj = subjects[(seedOffset + e) % subjects.length];
    let picked = nextFromGroup(primaryBySubject, subj, primaryCursors, seen);
    if (!picked) picked = nextFromGroup(fallbackBySubject, subj, fallbackCursors, seen);
    if (picked) {
      seen.add(picked.id);
      batch.push(picked);
    }
  }

  // Top-up with any remaining pool to hit the target without duplicates.
  const fallbackList = [...primaryPool, ...allQuestions];
  let cursor = seedOffset % (fallbackList.length || 1);
  while (batch.length < QUESTIONS_PER_MOCK && fallbackList.length) {
    const cand = fallbackList[cursor % fallbackList.length];
    cursor += 1;
    if (seen.has(cand.id)) continue;
    seen.add(cand.id);
    batch.push(cand);
  }

  return batch.slice(0, QUESTIONS_PER_MOCK);
}

async function persistMockMapping(mockTestId, questions) {
  if (!questions?.length) return;
  const mappingRows = questions.map((q, idx) => ({
    mock_test_id: mockTestId,
    question_id: q.id,
    position: idx + 1,
  }));

  // Replace any existing mapping for this mock to avoid conflicts.
  const { error: persistDelErr } = await supabase
    .from('mock_test_questions')
    .delete()
    .eq('mock_test_id', mockTestId);
  if (persistDelErr) console.warn('Persist delete failed (RLS?):', persistDelErr.message);
  checkRateLimit(insertLimiter, 'mock_persist_questions', 'mock seeds');
  await supabase
    .from('mock_test_questions')
    .upsert(deduplicateMappingRows(mappingRows), { onConflict: 'mock_test_id,question_id' });
}

async function maybeRebalanceMockQuestions(mockTestId, questions) {
  if (!questions?.length) return questions || [];

  const pyqCount = questions.filter(q => normalizeSubtype(q) === 'pyq').length;
  const pyqRatio = questions.length ? pyqCount / questions.length : 0;
  const needsMore = questions.length < QUESTIONS_PER_MOCK;
  const skewed = pyqRatio > 0.6;

  if (!needsMore && !skewed) return questions;

  const batch = await buildBalancedQuestions(mockTestId, true);
  const mapped = batch.map((q, idx) => ({ ...q, position: idx + 1 }));

  try {
    await persistMockMapping(mockTestId, mapped);
  } catch (e) {
    console.warn('Mock mapping rebalance skipped:', e?.message || e);
  }

  return mapped;
}

// Helper: fetch a mock test by id
export async function fetchMockTestById(mockTestId) {
  checkRateLimit(fetchLimiter, 'mock_test_one', 'mock test fetches');
  const { data, error } = await supabase
    .from('mock_tests')
    .select('id, name, duration_minutes, total_questions')
    .eq('id', mockTestId)
    .single();
  if (error) throw error;
  return data;
}

// Helper: get the most recent mock test (fallback when no id is provided)
export async function fetchLatestMockTest() {
  checkRateLimit(fetchLimiter, 'mock_test_latest', 'mock test fetches');
  const { data, error } = await supabase
    .from('mock_tests')
    .select('id, name, duration_minutes, total_questions')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Fetch mock test with ordered questions (single join, no N+1)
export async function fetchMockTestWithQuestions(mockTestId) {
  const mockTest = await fetchMockTestById(mockTestId);

  const { data: rows, error } = await supabase
    .from('mock_test_questions')
    .select(`position, questions ( id, question, options, correct_answer, subject, topic, difficulty, expected_time_sec, explanation, question_subtype, is_repeated )`)
    .eq('mock_test_id', mockTestId)
    .order('position', { ascending: true });
  if (error) throw error;

  let questions = (rows || [])
    .filter(r => r.questions)
    .map(r => ({ ...r.questions, position: r.position }));

  // Fallback: if mapping is empty, build an in-memory balanced batch so the test can start.
  if (!questions.length) {
    const batch = await buildBalancedQuestions(mockTestId);
    questions = batch.map((q, idx) => ({ ...q, position: idx + 1 }));

    // Best-effort persist mapping for future runs; ignore errors.
    try {
      await persistMockMapping(mockTestId, questions);
    } catch (e) {
      console.warn('Mock mapping persist skipped:', e?.message || e);
    }
  }

  questions = await maybeRebalanceMockQuestions(mockTestId, questions);

  return { mockTest, questions };
}

// Start or resume helpers -------------------------------------------------
export async function fetchInProgressAttempt({ userId, mockTestId }) {
  checkRateLimit(fetchLimiter, 'mock_attempt', 'mock attempts');
  const { data, error } = await supabase
    .from('user_mock_attempts')
    .select('id, mock_test_id, start_time, duration_sec, total_q')
    .eq('user_id', userId)
    .eq('mock_test_id', mockTestId)
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function startMockTest({ userId, mockTestId, durationSec, totalQuestions }) {
  checkRateLimit(insertLimiter, 'mock_attempt_insert', 'mock attempts');
  const { data, error } = await supabase
    .from('user_mock_attempts')
    .insert({
      user_id: userId,
      mock_test_id: mockTestId,
      status: 'in_progress',
      duration_sec: durationSec,
      total_q: totalQuestions,
    })
    .select('id, mock_test_id, start_time, duration_sec, total_q')
    .single();
  if (error) throw error;
  return data;
}

// Saved answers for resume
export async function fetchSavedAnswers(attemptId) {
  checkRateLimit(fetchLimiter, 'mock_answers', 'mock answers');
  const { data, error } = await supabase
    .from('user_mock_answers')
    .select('question_id, selected_answer, time_taken_sec, marked_for_review')
    .eq('attempt_id', attemptId);
  if (error) throw error;
  return data || [];
}

// Upsert a single answer (no is_correct until submit)
export async function saveAnswer({ attemptId, questionId, selectedAnswer, timeTakenSec, markedForReview }) {
  checkRateLimit(insertLimiter, 'mock_answer', 'answers');
  const payload = {
    attempt_id: attemptId,
    question_id: questionId,
    selected_answer: selectedAnswer ?? null,
    time_taken_sec: timeTakenSec ?? 0,
    marked_for_review: !!markedForReview,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('user_mock_answers')
    .upsert(payload, { onConflict: 'attempt_id,question_id' });
  if (error) throw error;
}

// Batch save multiple answers in one call
export async function batchSaveAnswers(attemptId, answers) {
  if (!answers || !answers.length) return;
  checkRateLimit(insertLimiter, 'mock_answer_batch', 'answers');
  const rows = answers.map(a => ({
    attempt_id: attemptId,
    question_id: a.questionId,
    selected_answer: a.selectedAnswer ?? null,
    time_taken_sec: a.timeTakenSec ?? 0,
    marked_for_review: !!a.markedForReview,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('user_mock_answers')
    .upsert(rows, { onConflict: 'attempt_id,question_id' });
  if (error) throw error;
}

// Submit: compute correctness, persist answers, close attempt
export async function submitMockTest({ attemptId, answers, questions, userId, durationSec }) {
  if (!attemptId) throw new Error('Missing attempt id');
  if (!userId) throw new Error('Missing user id');
  const questionMap = new Map(questions.map(q => [q.id, q.correct_answer]));

  const rows = answers.map(a => {
    const correct = questionMap.get(a.questionId);
    const isCorrect = a.selectedAnswer != null && a.selectedAnswer === correct;
    return {
      attempt_id: attemptId,
      question_id: a.questionId,
      selected_answer: a.selectedAnswer ?? null,
      is_correct: isCorrect,
      time_taken_sec: a.timeTakenSec ?? 0,
      marked_for_review: !!a.markedForReview,
      updated_at: new Date().toISOString(),
    };
  });

  checkRateLimit(insertLimiter, 'mock_answer_submit', 'answers');
  const { error: ansErr } = await supabase
    .from('user_mock_answers')
    .upsert(rows, { onConflict: 'attempt_id,question_id' });
  if (ansErr) throw ansErr;

  const score = rows.filter(r => r.is_correct).length;
  const total = questions.length;

  const { error: attErr } = await supabase
    .from('user_mock_attempts')
    .update({
      status: 'completed',
      score,
      total_q: total,
      end_time: new Date().toISOString(),
    })
    .eq('id', attemptId);
  if (attErr) throw attErr;

  // Mirror results into main attempts/sessions for global analytics
  await ingestMockAnalytics({
    attemptId,
    userId,
    questions,
    answers: rows,
    score,
    total,
    durationSec,
  });

  return { score, total, accuracy: total ? (score / total) * 100 : 0 };
}

// Ingest a completed mock into the primary analytics tables (sessions + attempts)
async function ingestMockAnalytics({ attemptId, userId, questions, answers, score, total, durationSec }) {
  // Best-effort guard: if we already ingested this attempt, skip (look for a session created for this attempt)
  const sessionLabel = `mock:${attemptId}`;

  // Reuse any existing session for this attempt
  const { data: existingSession, error: sessionErr } = await supabase
    .from('sessions')
    .select('id')
    .eq('mode', 'mock')
    .eq('subject', sessionLabel)
    .maybeSingle();
  if (sessionErr) throw sessionErr;

  let sessionId = existingSession?.id;

  if (!sessionId) {
    const totalTime = answers.reduce((s, a) => s + (a.time_taken_sec || 0), 0);
    const sessionPayload = {
      // Use an allowed mode to satisfy the sessions.mode check constraint
      mode: 'exam',
      subject: sessionLabel, // unique-ish label per attempt for idempotency
      total_questions: total,
      correct_answers: score,
      total_time: Math.max(totalTime, durationSec || 0),
    };
    const sessionRow = await insertSession(sessionPayload, userId);
    sessionId = sessionRow.id;
  } else {
    // If we found a session, clear prior attempt rows to avoid double-counting
    await supabase.from('attempts').delete().eq('session_id', sessionId);
  }

  if (!sessionId) return;

  const questionMeta = new Map(questions.map(q => [q.id, q]));

  const attemptRows = answers.map((a) => {
    const q = questionMeta.get(a.question_id) || {};
    const expected = q.expected_time_sec || 60;
    const timeTaken = a.time_taken_sec || 0;
    return {
      question_id: a.question_id,
      selected_answer: a.selected_answer,
      is_correct: a.is_correct,
      time_taken_sec: timeTaken,
      expected_time_sec: expected,
      subject: q.subject || 'Unknown',
      topic: q.topic || 'Unknown',
      difficulty: q.difficulty || 'Medium',
      session_id: sessionId,
      user_id: userId,
      attempt_number: 1,
      created_at: new Date().toISOString(),
    };
  });

  if (attemptRows.length) {
    const { error } = await supabase.from('attempts').insert(attemptRows);
    if (error) throw error;
  }
}

// Fetch attempt + answers + questions (2 queries max)
export async function fetchAttemptResult(attemptId) {
  checkRateLimit(fetchLimiter, 'mock_attempt_result', 'mock results');
  const { data: attempt, error: aErr } = await supabase
    .from('user_mock_attempts')
    .select('id, mock_test_id, score, total_q, start_time, end_time, status, duration_sec, mock_tests(name, duration_minutes)')
    .eq('id', attemptId)
    .single();
  if (aErr) throw aErr;

  const { data: answers, error: ansErr } = await supabase
    .from('user_mock_answers')
    .select(`
      question_id,
      selected_answer,
      is_correct,
      time_taken_sec,
      marked_for_review,
      questions (
        id, question, options, correct_answer, subject, topic, difficulty, expected_time_sec, explanation, question_subtype, is_repeated
      )
    `)
    .eq('attempt_id', attemptId);
  if (ansErr) throw ansErr;

  const enriched = (answers || [])
    .filter(a => a.questions)
    .map(a => ({
      ...a.questions,
      selected_answer: a.selected_answer,
      is_correct: a.is_correct,
      time_taken_sec: a.time_taken_sec,
      marked_for_review: a.marked_for_review,
    }));

  return { attempt, answers: enriched };
}

// Fetch recent mock attempts for analytics UI
export async function fetchMockAttemptSummaries(limit = 10) {
  checkRateLimit(fetchLimiter, 'mock_attempt_summaries', 'mock results');
  const { data, error } = await supabase
    .from('user_mock_attempts')
    .select('id, mock_test_id, score, total_q, start_time, end_time, status, mock_tests(name, duration_minutes)')
    .order('start_time', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
