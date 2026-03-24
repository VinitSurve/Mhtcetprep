import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import QuestionCard from '../components/QuestionCard';
import { fetchQuestions, insertAttempt, insertSession } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { generateId } from '../utils/helpers';

const SPEED_QUESTIONS = 10;
const TIME_PER_Q      = 30;

export default function SpeedMode() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase]         = useState('loading'); // loading|ready|active|result
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent]     = useState(0);
  const [selected, setSelected]   = useState(null);
  const [timeLeft, setTimeLeft]   = useState(TIME_PER_Q);
  const [results, setResults]     = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [streak, setStreak]       = useState(0);

  const sessionId   = useRef(generateId());
  const startRef    = useRef(Date.now());
  const timerRef    = useRef(null);
  const selectedRef = useRef(null); // avoid closure issues

  selectedRef.current = selected;

  const loadQuestions = useCallback(async () => {
    setPhase('loading');
    setLoadError(null);
    try {
      const qs = await fetchQuestions({ limit: SPEED_QUESTIONS });
      if (qs.length === 0) throw new Error('No questions found');
      setQuestions(qs);
      setPhase('ready');
    } catch (e) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  const recordAndAdvance = useCallback((autoSkipped = false) => {
    clearInterval(timerRef.current);
    const q         = questions[current];
    const sel       = autoSkipped ? null : selectedRef.current;
    const isCorrect = sel === q?.correct_answer;
    const actualTime = autoSkipped
      ? TIME_PER_Q
      : Math.round((Date.now() - startRef.current) / 1000);

    const result = {
      question_id:       q?.id,
      selected_answer:   sel,
      is_correct:        isCorrect,
      time_taken_sec:    actualTime,
      expected_time_sec: q?.expected_time_sec,
      subject:           q?.subject,
      topic:             q?.topic,
      question_subtype:  q?.question_subtype,
      difficulty:        q?.difficulty,
      was_guess:         false,
      session_id:        sessionId.current,
      autoSkipped,
    };

    setResults(prev => [...prev, result]);
    if (isCorrect) setStreak(s => s + 1);
    else setStreak(0);

    if (current + 1 >= questions.length) {
      // Save all attempts then show result
      const allResults = [...results, result];
      saveAndFinish(allResults);
    } else {
      setCurrent(c => c + 1);
      setSelected(null);
      setTimeLeft(TIME_PER_Q);
      startRef.current = Date.now();
    }
  }, [current, questions, results, timeLeft]);

  const saveAndFinish = async (allResults) => {
    const correct = allResults.filter(r => r.is_correct).length;
    try {
      for (const r of allResults) {
        const { autoSkipped, ...payload } = r;
        await insertAttempt(payload, user.id);
      }
      await insertSession({
        id:              sessionId.current,
        total_questions: SPEED_QUESTIONS,
        correct_answers: correct,
        total_time:      SPEED_QUESTIONS * TIME_PER_Q,
        mode:            'speed',
        subject:         'General Aptitude',
      }, user.id);
    } catch (_) {}
    setPhase('result');
  };

  // Per-question countdown
  useEffect(() => {
    if (phase !== 'active') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          recordAndAdvance(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, current, recordAndAdvance]);

  const startSpeed = () => {
    startRef.current = Date.now();
    setTimeLeft(TIME_PER_Q);
    setPhase('active');
  };

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center">
        {loadError ? (
          <div className="text-center">
            <div className="text-cet-red font-mono text-sm mb-3">⚠ {loadError}</div>
            <button onClick={loadQuestions} className="px-4 py-2 bg-cet-accent text-black rounded font-mono text-sm">Retry</button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-cet-accent border-t-transparent rounded-full animate-spin"/>
            <span className="text-cet-dim font-mono text-sm">Loading speed drill…</span>
          </div>
        )}
      </div>
    );
  }

  if (phase === 'ready') {
    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-cet-panel border border-cet-border rounded-2xl p-8 text-center animate-slide-up">
          <div className="text-4xl mb-4">⚡</div>
          <h2 className="font-display text-2xl font-bold text-cet-text mb-2">Speed Mode</h2>
          <p className="text-cet-dim text-sm mb-6">Think fast. Answer faster.</p>
          <div className="grid grid-cols-2 gap-3 mb-6 text-center">
            <div className="bg-cet-bg rounded-lg p-3 border border-cet-border">
              <div className="font-mono font-bold text-cet-accent text-xl">{SPEED_QUESTIONS}</div>
              <div className="text-xs text-cet-dim font-mono">Questions</div>
            </div>
            <div className="bg-cet-bg rounded-lg p-3 border border-cet-border">
              <div className="font-mono font-bold text-cet-red text-xl">{TIME_PER_Q}s</div>
              <div className="text-xs text-cet-dim font-mono">Per Question</div>
            </div>
          </div>
          <div className="text-xs text-cet-dim text-left space-y-1 mb-6 font-mono">
            <div>• Auto-skips if time runs out</div>
            <div>• No going back</div>
            <div>• Tracks your speed ratio</div>
          </div>
          <button onClick={startSpeed} className="w-full py-3 bg-cet-accent text-black font-display font-bold rounded-lg hover:bg-amber-400 transition-all">
            Start Speed Drill ⚡
          </button>
          <button onClick={() => navigate('/')} className="mt-3 w-full py-2 text-cet-dim font-mono text-sm hover:text-cet-text transition-all">
            ← Back
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'result') {
    const correct = results.filter(r => r.is_correct).length;
    const skipped = results.filter(r => r.autoSkipped).length;
    const acc = Math.round((correct / SPEED_QUESTIONS) * 100);
    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-cet-panel border border-cet-border rounded-2xl p-8 animate-slide-up">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">⚡</div>
            <div className="font-display text-3xl font-extrabold text-cet-accent">{acc}%</div>
            <div className="text-cet-dim font-mono text-sm">{correct}/{SPEED_QUESTIONS} correct</div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-6 text-center">
            <div className="bg-cet-bg rounded-lg p-2 border border-cet-border">
              <div className="font-mono font-bold text-cet-green">{correct}</div>
              <div className="text-xs text-cet-dim font-mono">Correct</div>
            </div>
            <div className="bg-cet-bg rounded-lg p-2 border border-cet-border">
              <div className="font-mono font-bold text-cet-red">{SPEED_QUESTIONS - correct - skipped}</div>
              <div className="text-xs text-cet-dim font-mono">Wrong</div>
            </div>
            <div className="bg-cet-bg rounded-lg p-2 border border-cet-border">
              <div className="font-mono font-bold text-cet-yellow">{skipped}</div>
              <div className="text-xs text-cet-dim font-mono">Skipped</div>
            </div>
          </div>

          {/* Per-question breakdown */}
          <div className="space-y-1 mb-6 max-h-40 overflow-y-auto">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs font-mono">
                <span className="text-cet-dim w-5">Q{i+1}</span>
                <span>{r.is_correct ? '✅' : r.autoSkipped ? '⏭' : '❌'}</span>
                <span className="text-cet-dim">{r.time_taken_sec}s</span>
                <span className="ml-auto text-cet-dim">{r.topic}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setResults([]); setCurrent(0); setStreak(0); loadQuestions(); }}
              className="flex-1 py-3 border border-cet-border text-cet-dim font-mono text-sm rounded-lg hover:border-cet-accent/40 hover:text-cet-text transition-all">
              Retry
            </button>
            <button onClick={() => navigate('/')}
              className="flex-1 py-3 bg-cet-accent text-black font-display font-bold text-sm rounded-lg hover:bg-amber-400 transition-all">
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── ACTIVE PHASE ──
  const q = questions[current];
  const pct = (timeLeft / TIME_PER_Q) * 100;

  return (
    <div className="min-h-screen bg-cet-bg font-body pb-20">
      {/* Speed header */}
      <header className="sticky top-0 z-10 border-b border-cet-border bg-cet-bg/90 backdrop-blur-sm px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-cet-dim">Q{current+1}/{SPEED_QUESTIONS}</span>
            {streak >= 3 && (
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-cet-accent/10 text-cet-accent border border-cet-accent/20">
                🔥 {streak} streak
              </span>
            )}
          </div>
          {/* Big countdown */}
          <div className="flex flex-col items-center">
            <div className={`font-mono text-3xl font-extrabold transition-colors
              ${timeLeft <= 5 ? 'text-cet-red animate-pulse' : timeLeft <= 10 ? 'text-cet-yellow' : 'text-cet-accent'}`}>
              {timeLeft}
            </div>
            <div className="w-32 h-1.5 bg-cet-border rounded-full overflow-hidden mt-1">
              <div
                className={`h-full rounded-full transition-all duration-1000
                  ${timeLeft <= 5 ? 'bg-cet-red' : timeLeft <= 10 ? 'bg-cet-yellow' : 'bg-cet-accent'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="font-mono text-xs text-cet-dim">
            {results.filter(r=>r.is_correct).length} ✓
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6">
        <div className="bg-cet-panel border border-cet-border rounded-xl p-5 mb-4">
          <QuestionCard
            question={q}
            selectedAnswer={selected}
            onSelect={setSelected}
            revealed={false}
            questionNumber={current + 1}
            totalQuestions={SPEED_QUESTIONS}
          />
        </div>

        <button
          onClick={() => recordAndAdvance(false)}
          disabled={!selected}
          className={`w-full py-3 rounded-lg font-display font-bold text-sm transition-all
            ${selected
              ? 'bg-cet-accent text-black hover:bg-amber-400'
              : 'bg-cet-border text-cet-muted cursor-not-allowed'}`}>
          Lock Answer →
        </button>
      </main>
    </div>
  );
}
