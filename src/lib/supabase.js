import { createClient } from '@supabase/supabase-js';
import { fetchLimiter, insertLimiter, checkRateLimit } from '../utils/rateLimiter';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || 'https://your-project.supabase.co';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || 'your-anon-key';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ── QUESTIONS (public read) ────────────────────────────────────

export async function fetchOneQuestion({ subject, topic, difficulty, excludeIds = [] } = {}) {
  checkRateLimit(fetchLimiter, 'q_single', 'question fetches');
  let query = supabase.from('questions').select('*');
  if (subject)    query = query.eq('subject', subject);
  if (topic)      query = query.eq('topic', topic);
  if (difficulty) query = query.eq('difficulty', difficulty);
  const safeExclude = excludeIds.slice(-150);
  if (safeExclude.length) query = query.not('id', 'in', `(${safeExclude.join(',')})`);
  const { data, error } = await query.limit(50);
  if (error) throw error;
  if (!data || data.length === 0) {
    let fallback = supabase.from('questions').select('*').limit(50);
    if (safeExclude.length) fallback = fallback.not('id', 'in', `(${safeExclude.join(',')})`);
    const { data: fb, error: e2 } = await fallback;
    if (e2) throw e2;
    if (!fb || fb.length === 0) throw new Error('No questions found. Check your Supabase setup.');
    return fb[Math.floor(Math.random() * fb.length)];
  }
  return data[Math.floor(Math.random() * data.length)];
}

export async function fetchQuestions({ limit = 10, subject, topic, difficulty, excludeIds = [] } = {}) {
  checkRateLimit(fetchLimiter, 'q_bulk', 'question fetches');
  let query = supabase.from('questions').select('*');
  if (subject)    query = query.eq('subject', subject);
  if (topic)      query = query.eq('topic', topic);
  if (difficulty) query = query.eq('difficulty', difficulty);
  if (excludeIds.length) query = query.not('id', 'in', `(${excludeIds.slice(-150).join(',')})`);
  const { data, error } = await query.limit(300);
  if (error) throw error;
  const shuffled = (data || []).sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}

export async function fetchFormulaQuestions({ subject, formula, limit = 120 } = {}) {
  checkRateLimit(fetchLimiter, 'formula_q', 'formula question fetches');
  let query = supabase
    .from('questions')
    .select('*')
    .not('formula', 'is', null);
  if (subject) query = query.eq('subject', subject);
  if (formula) query = query.eq('formula', formula);
  const { data, error } = await query.limit(limit);
  if (error) throw error;
  return data || [];
}

export async function fetchFormulaGroups(subject) {
  const rows = await fetchFormulaQuestions({ subject, limit: 400 });
  const map = new Map();
  for (const q of rows) {
    if (!q.formula) continue;
    const key = `${q.formula}::${q.topic}`;
    const curr = map.get(key) || {
      formula: q.formula,
      concept: q.concept || 'Concept',
      topic: q.topic,
      subject: q.subject,
      questions: [],
    };
    curr.questions.push(q);
    map.set(key, curr);
  }
  return Array.from(map.values());
}

export async function fetchQuestionsByIds(ids) {
  const safeIds = [...new Set((ids || []).filter(Boolean))].slice(0, 200);
  if (!safeIds.length) return [];
  const { data, error } = await supabase.from('questions').select('*').in('id', safeIds);
  if (error) throw error;
  const order = new Map(safeIds.map((id, idx) => [id, idx]));
  return (data || []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function fetchMistakeQuestions(limit = 30) {
  checkRateLimit(fetchLimiter, 'mistakes', 'mistake fetches');
  const { data: attempts, error: ae } = await supabase
    .from('attempts').select('question_id').eq('is_correct', false)
    .order('created_at', { ascending: false }).limit(200);
  if (ae) throw ae;
  const ids = [...new Set((attempts || []).map(a => a.question_id))].slice(0, limit);
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('questions').select('*').in('id', ids);
  if (error) throw error;
  return data || [];
}

export async function fetchHighFreqQuestions(limit = 100) {
  checkRateLimit(fetchLimiter, 'highfreq', 'question fetches');
  const { data: repeated, error: e1 } = await supabase
    .from('questions').select('*')
    .or('is_repeated.eq.true,frequency_count.gt.1')
    .order('frequency_count', { ascending: false }).limit(limit);
  if (e1) throw e1;
  if ((repeated || []).length >= limit) return repeated;
  const ids = (repeated || []).map(q => q.id);
  let fillQ = supabase.from('questions').select('*').limit(limit);
  if (ids.length) fillQ = fillQ.not('id', 'in', `(${ids.join(',')})`);
  const { data: fill, error: e2 } = await fillQ;
  if (e2) throw e2;
  return [...(repeated || []), ...(fill || [])].sort(() => Math.random() - 0.5).slice(0, limit);
}

// ── ATTEMPTS (user-scoped, RLS enforced) ──────────────────────

export async function insertAttempt(attempt, userId) {
  checkRateLimit(insertLimiter, 'attempt', 'attempt inserts');
  const { data, error } = await supabase
    .from('attempts').insert([{ ...attempt, user_id: userId }]).select().single();
  if (error) throw error;
  return data;
}

export async function insertAttemptsBatch(attempts, userId) {
  if (!attempts || attempts.length === 0) return [];
  checkRateLimit(insertLimiter, 'batch', 'batch inserts');
  const payloads = attempts.map(a => ({ ...a, user_id: userId }));
  const { data, error } = await supabase.from('attempts').insert(payloads).select();
  if (error) {
    const results = [];
    for (const a of payloads) {
      try {
        const { data: d, error: e } = await supabase.from('attempts').insert([a]).select().single();
        if (!e) results.push(d);
      } catch (_) {}
    }
    return results;
  }
  return data || [];
}

export async function fetchRecentAttempts(limit = 50) {
  checkRateLimit(fetchLimiter, 'recent_attempts', 'attempt fetches');
  const { data, error } = await supabase
    .from('attempts').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function fetchRevisionSignals(limit = 80) {
  checkRateLimit(fetchLimiter, 'revision_signals', 'revision signal fetches');

  const { data: wrongRows, error: e1 } = await supabase
    .from('attempts')
    .select('question_id, topic, subject, is_correct, speed_ratio, confidence_level, created_at')
    .eq('is_correct', false)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (e1) throw e1;

  const { data: slowRows, error: e2 } = await supabase
    .from('attempts')
    .select('question_id, topic, subject, is_correct, speed_ratio, confidence_level, created_at')
    .gt('speed_ratio', 1.5)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (e2) throw e2;

  const { data: lowConfRows, error: e3 } = await supabase
    .from('attempts')
    .select('question_id, topic, subject, is_correct, speed_ratio, confidence_level, created_at')
    .lte('confidence_level', 2)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (e3) throw e3;

  return {
    wrongRows: wrongRows || [],
    slowRows: slowRows || [],
    lowConfRows: lowConfRows || [],
  };
}

// ── SESSIONS (user-scoped, RLS enforced) ──────────────────────

export async function insertSession(session, userId) {
  checkRateLimit(insertLimiter, 'session', 'session inserts');
  const normalized = {
    ...session,
    subject: session.subject || 'General Aptitude',
  };
  const { data, error } = await supabase
    .from('sessions').insert([{ ...normalized, user_id: userId }]).select().single();
  if (error) throw error;
  return data;
}

export async function fetchRecentSessions(limit = 10) {
  checkRateLimit(fetchLimiter, 'sessions', 'session fetches');
  const { data, error } = await supabase
    .from('sessions').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

// ── FORMULA PROGRESS (user-scoped, RLS enforced) ──────────────

export async function fetchFormulaProgress(limit = 300) {
  checkRateLimit(fetchLimiter, 'formula_progress', 'formula progress fetches');
  const { data, error } = await supabase
    .from('formula_progress')
    .select('*')
    .order('last_practiced', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function upsertFormulaProgress({ userId, formula, topic, isCorrect, timeTakenSec }) {
  checkRateLimit(insertLimiter, 'formula_progress', 'formula progress writes');
  const { data: existing, error: e1 } = await supabase
    .from('formula_progress')
    .select('id, attempts, correct, avg_time')
    .eq('user_id', userId)
    .eq('formula', formula)
    .maybeSingle();
  if (e1) throw e1;

  const attempts = (existing?.attempts || 0) + 1;
  const correct = (existing?.correct || 0) + (isCorrect ? 1 : 0);
  const prevAvg = existing?.avg_time || 0;
  const avgTime = Math.round(((prevAvg * (attempts - 1)) + (timeTakenSec || 0)) / attempts);

  const payload = {
    id: existing?.id,
    user_id: userId,
    formula,
    topic,
    attempts,
    correct,
    avg_time: avgTime,
    last_practiced: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('formula_progress')
    .upsert([payload], { onConflict: 'user_id,formula' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchFormulaAnalytics(limit = 1200) {
  checkRateLimit(fetchLimiter, 'formula_analytics', 'formula analytics fetches');
  const { data, error } = await supabase
    .from('attempts')
    .select('question_id, is_correct, time_taken_sec, speed_ratio, created_at, questions(formula, concept, topic, subject)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ── ANALYTICS (user-scoped via RLS) ───────────────────────────

export async function fetchAnalytics() {
  checkRateLimit(fetchLimiter, 'analytics', 'analytics fetches');
  const { data, error } = await supabase
    .from('attempts')
    .select('is_correct, time_taken_sec, subject, topic, difficulty, confidence_level, was_guess, error_type, speed_ratio, created_at')
    .order('created_at', { ascending: false }).limit(2000);
  if (error) throw error;
  return data || [];
}

export async function fetchTopicPerformance() {
  const { data, error } = await supabase
    .from('topic_performance').select('*').order('accuracy_pct', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchSubjectPerformance() {
  const { data, error } = await supabase
    .from('subject_performance').select('*').order('accuracy_pct', { ascending: true });
  if (error) throw error;
  return data || [];
}
