import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import QuestionCard from '../components/QuestionCard';
import ConfidenceModal from '../components/ConfidenceModal';
import Timer from '../components/Timer';
import useAdaptiveEngine from '../hooks/useAdaptiveEngine';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchOneQuestion, fetchUserSeenQuestionIds, insertAttempt,
  insertSession,
} from '../lib/supabase';
import { generateId, speedColor, speedLabel, isAnswerCorrect } from '../utils/helpers';

const SEEN_WINDOW = 5000;

const SUBJECTS = [
  { value: '',                  label: 'All Subjects' },
  { value: 'Mathematics',       label: 'Mathematics' },
  { value: 'Computer Concepts', label: 'Computer Concepts' },
  { value: 'Logical Reasoning', label: 'Logical Reasoning' },
  { value: 'English',           label: 'English' },
  { value: 'General Aptitude',  label: 'General Aptitude' },
];

export default function Practice() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdaptive = searchParams.get('mode') === 'adaptive';

  const [question, setQuestion]             = useState(null);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [selectedAnswer, setSelected]       = useState(null);
  const [revealed, setRevealed]             = useState(false);
  const [showModal, setShowModal]           = useState(false);
  const [timerReset, setTimerReset]         = useState(0);
  const [sessionStats, setSession]          = useState({ correct: 0, total: 0, time: 0 });
  const [lastResult, setLastResult]         = useState(null);
  const [subjectFilter, setSubjectFilter]   = useState('');
  const [seenReady, setSeenReady]           = useState(false);

  const startTimeRef  = useRef(Date.now());
  const sessionIdRef  = useRef(generateId());
  const seenIdsRef    = useRef([]);
  const { getNextQuestion, updateAfterAttempt, flushPending } = useAdaptiveEngine({
    userId: user?.id,
    sessionId: sessionIdRef.current,
    enabled: isAdaptive,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!user?.id) {
          seenIdsRef.current = [];
          setSeenReady(true);
          return;
        }
        const ids = await fetchUserSeenQuestionIds(user.id, SEEN_WINDOW);
        if (!cancelled) seenIdsRef.current = ids;
      } catch (_) {
        if (!cancelled) seenIdsRef.current = [];
      } finally {
        if (!cancelled) setSeenReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const loadQuestion = useCallback(async () => {
    if (!seenReady) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    setRevealed(false);
    setLastResult(null);
    startTimeRef.current = Date.now();
    setTimerReset(n => n + 1);
    try {
      const q = isAdaptive
        ? await getNextQuestion({ externalExcludeIds: seenIdsRef.current })
        : await fetchOneQuestion({ ...(subjectFilter ? { subject: subjectFilter } : {}), excludeIds: seenIdsRef.current });

      if (!q) {
        throw new Error('No adaptive question found. Please retry.');
      }
      if (q?.id) {
        seenIdsRef.current = [...new Set([...seenIdsRef.current, q.id])].slice(-SEEN_WINDOW);
      }
      setQuestion(q);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [isAdaptive, subjectFilter, seenReady]);

  useEffect(() => { loadQuestion(); }, [loadQuestion]);

  const handleSubmit = () => {
    if (!selectedAnswer) return;
    setRevealed(true);
    setShowModal(true);
  };

  const handleSkip = async () => {
    if (!question) return;
    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000);
    insertAttempt({
      question_id: question.id, selected_answer: null, is_correct: false,
      time_taken_sec: timeTaken, expected_time_sec: question.expected_time_sec,
      subject: question.subject, topic: question.topic,
      question_subtype: question.question_subtype, difficulty: question.difficulty,
      was_guess: false, session_id: sessionIdRef.current,
    }, user.id).catch(() => {});
    if (isAdaptive) {
      updateAfterAttempt({
        question,
        isCorrect: false,
        timeTakenSec: timeTaken,
      }).catch(() => {});
    }
    setSession(s => ({ ...s, total: s.total + 1 }));
    loadQuestion();
  };

  const handleModalSubmit = async ({ confidence, wasGuess, errorType }) => {
    setShowModal(false);
    const timeTaken  = Math.round((Date.now() - startTimeRef.current) / 1000);
    const isCorrect  = isAnswerCorrect(question, selectedAnswer);
    const speedRatio = timeTaken / (question.expected_time_sec || 60);
    setLastResult({ isCorrect, timeTaken, speedRatio });
    setSession(s => ({
      correct: s.correct + (isCorrect ? 1 : 0),
      total:   s.total + 1,
      time:    s.time + timeTaken,
    }));
    try {
      await insertAttempt({
        question_id: question.id, selected_answer: selectedAnswer,
        is_correct: isCorrect, time_taken_sec: timeTaken,
        expected_time_sec: question.expected_time_sec,
        subject: question.subject, topic: question.topic,
        question_subtype: question.question_subtype, difficulty: question.difficulty,
        confidence_level: confidence, was_guess: wasGuess,
        error_type: errorType, session_id: sessionIdRef.current,
      }, user.id);
      if (isAdaptive) {
        await updateAfterAttempt({
          question,
          isCorrect,
          timeTakenSec: timeTaken,
        });
      }
    } catch (_) {}
  };

  const handleEndSession = async () => {
    if (sessionStats.total > 0) {
      await insertSession({
        id: sessionIdRef.current,
        total_questions: sessionStats.total,
        correct_answers: sessionStats.correct,
        total_time:      sessionStats.time,
        mode:            isAdaptive ? 'adaptive' : 'practice',
        subject:         subjectFilter || 'General Aptitude',
      }, user.id).catch(() => {});
    }
    if (isAdaptive) await flushPending().catch(() => {});
    navigate('/');
  };

  const accuracy = sessionStats.total > 0
    ? Math.round((sessionStats.correct / sessionStats.total) * 100) : null;

  return (
    <div className="min-h-screen bg-cet-bg font-body pb-20">
      <header className="sticky top-0 z-10 border-b border-cet-border bg-cet-bg/90 backdrop-blur-sm px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <button onClick={handleEndSession} className="text-cet-dim text-sm font-mono hover:text-cet-text">← Exit</button>
              <div className="text-sm font-display font-bold text-cet-text">
                {isAdaptive ? '🧠 Adaptive' : '📖 Practice'}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {question && !revealed && (
                <Timer mode="countdown" initialSeconds={question.expected_time_sec * 2}
                  running={!revealed && !loading} reset={timerReset}
                  onExpire={() => { if (!revealed && selectedAnswer) handleSubmit(); }} />
              )}
              {sessionStats.total > 0 && (
                <div className="font-mono text-xs text-cet-dim">
                  <span className="text-cet-green">{sessionStats.correct}</span>
                  <span className="text-cet-muted">/{sessionStats.total}</span>
                  {accuracy !== null && (
                    <span className={`ml-1 ${accuracy>=70?'text-cet-green':accuracy>=50?'text-cet-yellow':'text-cet-red'}`}>
                      {accuracy}%
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {!isAdaptive && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-select">
              {SUBJECTS.map(s => (
                <button key={s.value}
                  onClick={() => { if (subjectFilter !== s.value) { seenIdsRef.current = []; setSubjectFilter(s.value); } }}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-mono border transition-all
                    ${subjectFilter === s.value
                      ? 'border-cet-accent bg-cet-accent/10 text-cet-accent'
                      : 'border-cet-border text-cet-dim hover:border-cet-accent/40 hover:text-cet-text'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6">
        {lastResult && (
          <div className={`flex items-center gap-3 p-3 rounded-lg border mb-4 animate-slide-up
            ${lastResult.isCorrect ? 'bg-cet-green/10 border-cet-green/30' : 'bg-cet-red/10 border-cet-red/30'}`}>
            <span>{lastResult.isCorrect ? '✅' : '❌'}</span>
            <span className="text-sm text-cet-text">{lastResult.isCorrect ? 'Correct!' : 'Wrong'}</span>
            <span className="ml-auto font-mono text-xs">
              ⏱ {lastResult.timeTaken}s
              <span className={`ml-2 ${speedColor(lastResult.speedRatio)}`}>{speedLabel(lastResult.speedRatio)}</span>
            </span>
          </div>
        )}

        <div className="bg-cet-panel border border-cet-border rounded-xl p-5 mb-4">
          {loading ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-cet-accent border-t-transparent rounded-full animate-spin"/>
              <span className="text-cet-dim font-mono text-sm">
                {isAdaptive ? 'Selecting adaptive question…' : 'Loading question…'}
              </span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-cet-red font-mono text-sm mb-4">⚠ {error}</div>
              <div className="text-cet-dim text-xs mb-4">Check your Supabase connection in .env</div>
              <button onClick={loadQuestion} className="px-4 py-2 bg-cet-accent text-black rounded font-mono text-sm">Retry</button>
            </div>
          ) : (
            <QuestionCard question={question} selectedAnswer={selectedAnswer}
              onSelect={a => !revealed && setSelected(a)} revealed={revealed} />
          )}
        </div>

        {!loading && !error && (
          <div className="flex gap-3">
            {!revealed ? (
              <>
                <button onClick={handleSkip}
                  className="flex-1 py-3 rounded-lg border border-cet-border text-cet-dim font-mono text-sm hover:border-cet-yellow/40 hover:text-cet-yellow transition-all">
                  Skip →
                </button>
                <button onClick={handleSubmit} disabled={!selectedAnswer}
                  className={`flex-[2] py-3 rounded-lg font-display font-bold text-sm transition-all
                    ${selectedAnswer ? 'bg-cet-accent text-black hover:bg-amber-400' : 'bg-cet-border text-cet-muted cursor-not-allowed'}`}>
                  Submit Answer
                </button>
              </>
            ) : (
              <button onClick={loadQuestion}
                className="w-full py-3 rounded-lg bg-cet-accent text-black font-display font-bold text-sm hover:bg-amber-400 transition-all">
                Next Question →
              </button>
            )}
          </div>
        )}
      </main>

      {showModal && (
        <ConfidenceModal isCorrect={isAnswerCorrect(question, selectedAnswer)} onSubmit={handleModalSubmit} />
      )}
    </div>
  );
}
