import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchQuestionCandidates,
  fetchRecentAttempts,
  upsertUserTagPerformance,
} from '../lib/supabase';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
const HARD_RECENT_LIMIT = 10;
const SOFT_REPEAT_COUNT = 2;
const SOFT_LOOKBACK = 100;
const BATCH_SYNC_EVERY = 5;

function hashString(value) {
  const input = String(value || '');
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function seededNoise(seed, key) {
  return (hashString(`${seed}:${key}`) % 10000) / 10000;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeDifficulty(value) {
  if (!value) return 'Medium';
  const lower = String(value).toLowerCase();
  if (lower === 'easy') return 'Easy';
  if (lower === 'hard') return 'Hard';
  return 'Medium';
}

function shiftDifficulty(current, delta) {
  const idx = DIFFICULTIES.indexOf(normalizeDifficulty(current));
  const nextIdx = clamp(idx + delta, 0, DIFFICULTIES.length - 1);
  return DIFFICULTIES[nextIdx];
}

function calculateWeakness({ accuracy, avgTime, attempts }, tagWeightage, expectedTime) {
  const accuracyRatio = clamp((accuracy || 0) / 100, 0, 1);
  const safeExpected = expectedTime > 0 ? expectedTime : 60;
  const rawTimeFactor = safeExpected > 0 ? (avgTime || 0) / safeExpected : 1;
  const timeFactor = attempts < 3 ? 0.1 : clamp(rawTimeFactor, 0, 2);
  const weightFactor = clamp((tagWeightage || 3) / 5, 0, 1);
  const core = ((1 - accuracyRatio) * 0.5) + (timeFactor * 0.3) + (weightFactor * 0.2);
  const confidence = clamp((attempts || 0) / 10, 0, 1);
  return clamp(core, 0, 1) * confidence;
}

function buildInitialProfile(attempts, sessionId, userId) {
  const tags = {};
  const outcomes = [];
  const recentQuestions = [];
  const questionCounts = {};
  const questionLastSeen = {};

  const latestFirst = [...(attempts || [])];
  for (const a of latestFirst) {
    if (a.question_id != null) {
      questionCounts[a.question_id] = (questionCounts[a.question_id] || 0) + 1;
      if (!questionLastSeen[a.question_id]) {
        questionLastSeen[a.question_id] = a.created_at || new Date().toISOString();
      }
      if (recentQuestions.length < HARD_RECENT_LIMIT && !recentQuestions.includes(a.question_id)) {
        recentQuestions.push(a.question_id);
      }
    }
  }

  const oldestFirst = [...latestFirst].reverse();
  let total = 0;
  let correct = 0;
  let totalTime = 0;
  let currentStreak = 0;

  for (const a of oldestFirst) {
    const tag = a.topic || 'Unknown';
    if (!tags[tag]) {
      tags[tag] = {
        tag,
        attempts: 0,
        correct: 0,
        totalTime: 0,
        totalExpectedTime: 0,
        totalWeightage: 0,
        avgTime: 0,
        accuracy: 0,
        weaknessScore: 0,
      };
    }
    const bucket = tags[tag];
    const expectedTime = a.expected_time_sec || 60;
    const weightage = a.weightage || 3;

    bucket.attempts += 1;
    bucket.correct += a.is_correct ? 1 : 0;
    bucket.totalTime += (a.time_taken_sec || 0);
    bucket.totalExpectedTime += expectedTime;
    bucket.totalWeightage += weightage;

    total += 1;
    correct += a.is_correct ? 1 : 0;
    totalTime += (a.time_taken_sec || 0);

    outcomes.push(Boolean(a.is_correct));
    if (a.is_correct) currentStreak += 1;
    else currentStreak = 0;
  }

  Object.values(tags).forEach((t) => {
    t.avgTime = t.attempts > 0 ? t.totalTime / t.attempts : 0;
    t.accuracy = t.attempts > 0 ? (t.correct / t.attempts) * 100 : 0;
    const tagWeightage = t.attempts > 0 ? t.totalWeightage / t.attempts : 3;
    const expected = t.attempts > 0 ? t.totalExpectedTime / t.attempts : 60;
    let weakness = calculateWeakness(t, tagWeightage, expected);
    if (t.accuracy > 85 && t.attempts > 5) weakness *= 0.6;
    t.weaknessScore = weakness;
  });

  return {
    userId,
    sessionId,
    currentDifficulty: 'Medium',
    tags,
    recentOutcomes: outcomes.slice(-10),
    recentQuestions,
    questionCounts,
    questionLastSeen,
    session: {
      total,
      correct,
      totalTime,
      currentStreak,
      easyInRow: 0,
    },
  };
}

function getWeakestTag(profile) {
  const tags = Object.values(profile.tags || {});
  if (!tags.length) return null;
  return tags
    .sort((a, b) => {
      if (b.weaknessScore !== a.weaknessScore) return b.weaknessScore - a.weaknessScore;
      return (a.accuracy || 0) - (b.accuracy || 0);
    })[0]?.tag || null;
}

function pickFromCandidates({ candidates, seed, questionCounts, questionLastSeen }) {
  if (!candidates.length) return null;

  const softExcluded = [];
  const primary = [];
  for (const q of candidates) {
    const count = questionCounts[q.id] || 0;
    if (count >= SOFT_REPEAT_COUNT) softExcluded.push(q);
    else primary.push(q);
  }

  const pool = primary.length ? primary : softExcluded;
  const sorted = [...pool].sort((a, b) => {
    const wa = a.weightage || 3;
    const wb = b.weightage || 3;
    if (wb !== wa) return wb - wa;

    const fa = a.frequency_count || 1;
    const fb = b.frequency_count || 1;
    if (fb !== fa) return fb - fa;

    const ca = questionCounts[a.id] || 0;
    const cb = questionCounts[b.id] || 0;
    if (primary.length === 0 && ca !== cb) return ca - cb;

    if (primary.length === 0 && ca > 0 && cb > 0) {
      const la = questionLastSeen[a.id] ? Date.parse(questionLastSeen[a.id]) : 0;
      const lb = questionLastSeen[b.id] ? Date.parse(questionLastSeen[b.id]) : 0;
      if (la !== lb) return la - lb;
    }

    const na = seededNoise(seed, a.id);
    const nb = seededNoise(seed, b.id);
    if (nb !== na) return nb - na;

    return (a.id || 0) - (b.id || 0);
  });

  return sorted[0] || null;
}

export default function useAdaptiveEngine({ userId, sessionId, enabled }) {
  const [userProfile, setUserProfile] = useState(() => buildInitialProfile([], sessionId, userId));
  const initializedRef = useRef(false);
  const pendingCountRef = useRef(0);
  const latestProfileRef = useRef(userProfile);
  const seed = useMemo(() => hashString(`${userId || 'anon'}:${sessionId || 'session'}`), [userId, sessionId]);

  useEffect(() => {
    latestProfileRef.current = userProfile;
  }, [userProfile]);

  const syncTagPerformance = useCallback(async (profile) => {
    if (!enabled || !userId) return;
    const rows = Object.values(profile.tags || {}).map(t => ({
      user_id: userId,
      tag: t.tag,
      attempts: t.attempts,
      correct: t.correct,
      avg_time_sec: Math.round(t.avgTime || 0),
      accuracy: Number((t.accuracy || 0).toFixed(2)),
      weakness_score: Number((t.weaknessScore || 0).toFixed(4)),
      last_updated: new Date().toISOString(),
    }));
    await upsertUserTagPerformance(rows);
  }, [enabled, userId]);

  const flushPending = useCallback(async () => {
    pendingCountRef.current = 0;
    await syncTagPerformance(latestProfileRef.current);
  }, [syncTagPerformance]);

  useEffect(() => {
    if (!enabled || !userId || initializedRef.current) return;
    let active = true;
    (async () => {
      try {
        const recent = await fetchRecentAttempts(250);
        if (!active) return;
        const profile = buildInitialProfile(recent, sessionId, userId);
        setUserProfile(profile);
        initializedRef.current = true;
      } catch (_) {
        initializedRef.current = true;
      }
    })();
    return () => { active = false; };
  }, [enabled, sessionId, userId]);

  useEffect(() => {
    if (!enabled) return undefined;
    const handler = () => { flushPending().catch(() => {}); };
    window.addEventListener('beforeunload', handler);
    document.addEventListener('visibilitychange', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      document.removeEventListener('visibilitychange', handler);
    };
  }, [enabled, flushPending]);

  const getTargetDifficulty = useCallback((profile) => {
    const total = profile.session.total || 0;
    const accuracy = total > 0 ? profile.session.correct / total : 0;

    if (total >= 6 && accuracy < 0.5) return 'Easy';
    if (profile.session.easyInRow >= 5) return 'Medium';
    if (total >= 8 && accuracy > 0.85 && profile.session.currentStreak >= 5) return 'Hard';

    const outcomes = profile.recentOutcomes || [];
    const last2Wrong = outcomes.length >= 2 && !outcomes[outcomes.length - 1] && !outcomes[outcomes.length - 2];
    const last3Correct = outcomes.length >= 3 && outcomes.slice(-3).every(Boolean);

    if (last2Wrong) return shiftDifficulty(profile.currentDifficulty, -1);
    if (last3Correct) return shiftDifficulty(profile.currentDifficulty, 1);
    return normalizeDifficulty(profile.currentDifficulty);
  }, []);

  const getNextQuestion = useCallback(async ({ subject = '', externalExcludeIds = [] } = {}) => {
    if (!enabled) return null;

    const hardExclude = [...new Set([
      ...(userProfile.recentQuestions || []),
      ...(externalExcludeIds || []),
    ])].slice(-150);

    const weakestTag = getWeakestTag(userProfile);
    const targetDifficulty = getTargetDifficulty(userProfile);

    const recentCounts = {};
    Object.entries(userProfile.questionCounts || {}).forEach(([qid, count]) => {
      recentCounts[qid] = count;
    });

    const baseTier = [];
    if ((userProfile.session.total || 0) === 0 || !weakestTag) {
      baseTier.push({ topic: null, difficulty: 'Easy', reason: 'cold_start' });
      baseTier.push({ topic: null, difficulty: targetDifficulty, reason: 'cold_start_target' });
      baseTier.push({ topic: null, difficulty: null, reason: 'cold_start_fallback' });
    } else {
      baseTier.push({ topic: weakestTag, difficulty: targetDifficulty, reason: 'weak_tag_difficulty' });
      baseTier.push({ topic: weakestTag, difficulty: null, reason: 'weak_tag_any_difficulty' });
      baseTier.push({ topic: null, difficulty: targetDifficulty, reason: 'any_question_target_difficulty' });
      baseTier.push({ topic: null, difficulty: null, reason: 'any_question' });
    }

    for (let i = 0; i < baseTier.length; i++) {
      const tier = baseTier[i];
      const candidates = await fetchQuestionCandidates({
        subject: subject || undefined,
        topic: tier.topic || undefined,
        difficulty: tier.difficulty || undefined,
        excludeIds: hardExclude,
        limit: 220,
      });

      if (!candidates.length) continue;

      const recentSubset = Object.fromEntries(
        Object.entries(recentCounts).slice(0, SOFT_LOOKBACK),
      );
      const selected = pickFromCandidates({
        candidates,
        seed,
        questionCounts: recentSubset,
        questionLastSeen: userProfile.questionLastSeen || {},
      });

      if (selected) {
        if (import.meta.env.DEV) {
          // Structured debug log to inspect adaptive decisions.
          console.info('adaptive_decision', {
            weakest_tag: weakestTag,
            difficulty: tier.difficulty || 'any',
            selected_question_id: selected.id,
            reason: tier.reason,
            fallback_level: i + 1,
            session_id: sessionId,
          });
        }
        return selected;
      }
    }

    return null;
  }, [enabled, getTargetDifficulty, seed, sessionId, userProfile]);

  const updateAfterAttempt = useCallback(async ({
    question,
    isCorrect,
    timeTakenSec,
  }) => {
    if (!enabled || !question?.id) return;

    let nextProfileSnapshot = null;
    setUserProfile((prev) => {
      const next = {
        ...prev,
        tags: { ...prev.tags },
        questionCounts: { ...(prev.questionCounts || {}) },
        questionLastSeen: { ...(prev.questionLastSeen || {}) },
        recentQuestions: [...(prev.recentQuestions || [])],
        recentOutcomes: [...(prev.recentOutcomes || [])],
        session: { ...(prev.session || {}) },
      };

      const tag = question.topic || 'Unknown';
      if (!next.tags[tag]) {
        next.tags[tag] = {
          tag,
          attempts: 0,
          correct: 0,
          totalTime: 0,
          totalExpectedTime: 0,
          totalWeightage: 0,
          avgTime: 0,
          accuracy: 0,
          weaknessScore: 0,
        };
      }

      const t = next.tags[tag];
      t.attempts += 1;
      t.correct += isCorrect ? 1 : 0;
      t.totalTime += (timeTakenSec || 0);
      t.totalExpectedTime += (question.expected_time_sec || 60);
      t.totalWeightage += (question.weightage || 3);
      t.avgTime = t.totalTime / t.attempts;
      t.accuracy = (t.correct / t.attempts) * 100;
      const tagWeightage = t.totalWeightage / t.attempts;
      const expectedTime = t.totalExpectedTime / t.attempts;
      let weakness = calculateWeakness(t, tagWeightage, expectedTime);
      if (t.accuracy > 85 && t.attempts > 5) weakness *= 0.6;
      t.weaknessScore = weakness;

      next.session.total = (next.session.total || 0) + 1;
      next.session.correct = (next.session.correct || 0) + (isCorrect ? 1 : 0);
      next.session.totalTime = (next.session.totalTime || 0) + (timeTakenSec || 0);
      next.session.currentStreak = isCorrect ? (next.session.currentStreak || 0) + 1 : 0;
      next.session.easyInRow = normalizeDifficulty(question.difficulty) === 'Easy'
        ? (next.session.easyInRow || 0) + 1
        : 0;

      next.recentOutcomes.push(Boolean(isCorrect));
      if (next.recentOutcomes.length > 10) next.recentOutcomes = next.recentOutcomes.slice(-10);

      next.recentQuestions.push(question.id);
      next.recentQuestions = [...new Set(next.recentQuestions)].slice(-HARD_RECENT_LIMIT);

      next.questionCounts[question.id] = (next.questionCounts[question.id] || 0) + 1;
      next.questionLastSeen[question.id] = new Date().toISOString();

      next.currentDifficulty = getTargetDifficulty(next);
      nextProfileSnapshot = next;
      return next;
    });

    pendingCountRef.current += 1;
    if (pendingCountRef.current >= BATCH_SYNC_EVERY) {
      pendingCountRef.current = 0;
      await syncTagPerformance(nextProfileSnapshot || latestProfileRef.current);
    }
  }, [enabled, getTargetDifficulty, syncTagPerformance]);

  return {
    userProfile,
    getNextQuestion,
    updateAfterAttempt,
    flushPending,
  };
}
