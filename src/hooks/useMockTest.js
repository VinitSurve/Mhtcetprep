import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchLatestMockTest,
  fetchMockTestWithQuestions,
  startMockTest,
  batchSaveAnswers,
  submitMockTest,
} from '../lib/mockTestApi';

const AUTO_SAVE_MS = 12_000;

export default function useMockTest({ userId, mockTestId }) {
  const [phase, setPhase] = useState('loading'); // loading | ready | active | submitting | done | error
  const [mockTestIdState, setMockTestId] = useState(mockTestId || null);
  const [mockMeta, setMockMeta] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attemptId, setAttemptId] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState(new Map()); // qId -> option key
  const [marked, setMarked] = useState(new Set());   // qId
  const [visited, setVisited] = useState(new Set()); // qId
  const [timePerQ, setTimePerQ] = useState(new Map());
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const attemptRef = useRef(null);
  const userIdRef = useRef(userId);
  const qStartRef = useRef(null);
  const dirtyRef = useRef(new Map()); // qId -> { questionId, selectedAnswer, timeTakenSec, markedForReview }
  const timerRef = useRef(null);
  const durationSecRef = useRef(90 * 60);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // Helpers ------------------------------------------------------------
  const recordTimeOnCurrent = useCallback(() => {
    if (!qStartRef.current) return 0;
    const delta = Math.max(0, Math.round((Date.now() - qStartRef.current) / 1000));
    qStartRef.current = null;
    return delta;
  }, []);

  const markDirty = useCallback((qId, payload) => {
    dirtyRef.current.set(qId, payload);
  }, []);

  const flushDirty = useCallback(async () => {
    if (!attemptRef.current || dirtyRef.current.size === 0) return;
    const batch = Array.from(dirtyRef.current.values());
    dirtyRef.current = new Map();
    try {
      await batchSaveAnswers(attemptRef.current, batch);
    } catch (e) {
      // re-queue on failure
      for (const row of batch) dirtyRef.current.set(row.questionId, row);
    }
  }, []);

  // Auto-save interval
  useEffect(() => {
    if (phase !== 'active') return undefined;
    timerRef.current = setInterval(flushDirty, AUTO_SAVE_MS);
    return () => clearInterval(timerRef.current);
  }, [phase, flushDirty]);

  // Init ---------------------------------------------------------------
  useEffect(() => {
    if (!userId) {
      setError('You need to sign in to start a mock test.');
      setPhase('error');
      return;
    }

      if (!mockTestId) {
      // Wait for a selection
      setPhase('idle');
      setMockMeta(null);
      setQuestions([]);
      setAttemptId(null);
      setCurrentIdx(0);
      setAnswers(new Map());
      setMarked(new Set());
      setVisited(new Set());
      setTimePerQ(new Map());
      setResult(null);
      attemptRef.current = null;
      qStartRef.current = null;
      dirtyRef.current = new Map();
      return;
    }

    let cancelled = false;

    const resetState = () => {
      setMockMeta(null);
      setQuestions([]);
      setAttemptId(null);
      setCurrentIdx(0);
      setAnswers(new Map());
      setMarked(new Set());
      setVisited(new Set());
      setTimePerQ(new Map());
      setResult(null);
      attemptRef.current = null;
      qStartRef.current = null;
      dirtyRef.current = new Map();
    };

    const load = async () => {
      resetState();
      setPhase('loading');
      setError(null);
      try {
        let testId = mockTestId;
        let meta = null;
        if (!testId) {
          meta = await fetchLatestMockTest();
          if (!meta) throw new Error('No mock tests available. Ask admin to seed one.');
          testId = meta.id;
        }

        const { mockTest, questions: qs } = await fetchMockTestWithQuestions(testId);
        if (!qs?.length) throw new Error('No questions available for this mock.');
        meta = mockTest;
        durationSecRef.current = (meta.duration_minutes || 90) * 60;

        const attempt = await startMockTest({
          userId,
          mockTestId: testId,
          durationSec: durationSecRef.current,
          totalQuestions: meta.total_questions || qs.length || 100,
        });

        if (cancelled) return;
        setMockTestId(testId);
        setMockMeta(meta);
        setQuestions(qs);
        setAttemptId(attempt.id);
        attemptRef.current = attempt.id;
        setPhase('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e.message);
        setPhase('error');
      }
    };

    load();
    return () => { cancelled = true; };
  }, [userId, mockTestId]);

  const startActive = useCallback(() => {
    if (!questions.length) {
      setError('No questions available for this mock. Ask admin to seed questions.');
      setPhase('error');
      return;
    }
    setPhase('active');
    const firstId = questions[0].id;
    setVisited(prev => new Set(prev).add(firstId));
    qStartRef.current = Date.now();
  }, [questions]);

  // Navigation ---------------------------------------------------------
  const goTo = useCallback((nextIdx) => {
    if (!questions.length || nextIdx < 0 || nextIdx >= questions.length) return;

    const prevIdx = currentIdx;
    const prevQ = questions[prevIdx];
    const spent = recordTimeOnCurrent();
    if (prevQ && spent > 0) {
      setTimePerQ(prev => {
        const map = new Map(prev);
        map.set(prevQ.id, (map.get(prevQ.id) || 0) + spent);
        return map;
      });
      markDirty(prevQ.id, {
        questionId: prevQ.id,
        selectedAnswer: answers.get(prevQ.id) ?? null,
        timeTakenSec: (timePerQ.get(prevQ.id) || 0) + spent,
        markedForReview: marked.has(prevQ.id),
      });
    }

    setCurrentIdx(nextIdx);
    const nextId = questions[nextIdx].id;
    setVisited(prev => new Set(prev).add(nextId));
    qStartRef.current = Date.now();
  }, [answers, currentIdx, markDirty, marked, questions, recordTimeOnCurrent, timePerQ]);

  const selectAnswer = useCallback((qId, choice) => {
    setAnswers(prev => {
      const map = new Map(prev);
      map.set(qId, choice);
      return map;
    });
    markDirty(qId, {
      questionId: qId,
      selectedAnswer: choice,
      timeTakenSec: timePerQ.get(qId) || 0,
      markedForReview: marked.has(qId),
    });
  }, [markDirty, marked, timePerQ]);

  const toggleMark = useCallback((qId) => {
    setMarked(prev => {
      const next = new Set(prev);
      next.has(qId) ? next.delete(qId) : next.add(qId);
      markDirty(qId, {
        questionId: qId,
        selectedAnswer: answers.get(qId) ?? null,
        timeTakenSec: timePerQ.get(qId) || 0,
        markedForReview: next.has(qId),
      });
      return next;
    });
  }, [answers, markDirty, timePerQ]);

  // Submit -------------------------------------------------------------
  const doSubmit = useCallback(async () => {
    if (!attemptRef.current) return;
    setPhase('submitting');
    try {
      const curQ = questions[currentIdx];
      const spent = recordTimeOnCurrent();
      if (curQ && spent > 0) {
        timePerQ.set(curQ.id, (timePerQ.get(curQ.id) || 0) + spent);
      }

      // flush pending
      const finalAnswers = questions.map(q => ({
        questionId: q.id,
        selectedAnswer: answers.get(q.id) ?? null,
        timeTakenSec: timePerQ.get(q.id) || 0,
        markedForReview: marked.has(q.id),
      }));

      await flushDirty();
      const res = await submitMockTest({
        attemptId: attemptRef.current,
        answers: finalAnswers,
        questions,
        userId: userIdRef.current,
        durationSec: durationSecRef.current,
      });
      setResult(res);
      setPhase('done');
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  }, [answers, currentIdx, flushDirty, marked, questions, recordTimeOnCurrent, timePerQ]);

  const handleTimeout = useCallback(() => {
    doSubmit();
  }, [doSubmit]);

  return {
    phase,
    mockTestId: mockTestIdState,
    mockMeta,
    questions,
    attemptId,
    currentIdx,
    answers,
    marked,
    visited,
    timePerQ,
    error,
    result,
    durationSec: durationSecRef.current,
    startActive,
    goTo,
    selectAnswer,
    toggleMark,
    handleTimeout,
    submit: doSubmit,
  };
}
