import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import QuestionCard from '../components/QuestionCard';
import NavigationPanel from '../components/NavigationPanel';
import ProgressBar from '../components/ProgressBar';
import Timer from '../components/Timer';
import { fetchQuestions, insertAttemptsBatch, insertSession } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { generateId, formatTime } from '../utils/helpers';

const TOTAL_QUESTIONS = 100;
const EXAM_DURATION   = 90 * 60; // 5400 seconds

const SUBJECT_OPTIONS = [
  { value: '',                  label: 'All Subjects (Full CET)' },
  { value: 'Mathematics',       label: 'Mathematics only' },
  { value: 'Computer Concepts', label: 'Computer Concepts only' },
  { value: 'Logical Reasoning', label: 'Logical Reasoning only' },
  { value: 'English',           label: 'English only' },
];

export default function Exam() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase]         = useState('loading'); // loading|ready|active|review|result
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent]     = useState(0);
  const [answers, setAnswers]     = useState({});
  const [marked, setMarked]       = useState(new Set());
  const [timeTaken, setTimeTaken] = useState(0);
  const [submitLoading, setSubmit]= useState(false);
  const [result, setResult]       = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [subjectFilter, setSubjectFilter] = useState('');

  const sessionId   = useRef(generateId());
  const qStartTimes = useRef({});

  const loadQuestions = useCallback(async (subject = '') => {
    setPhase('loading');
    setLoadError(null);
    try {
      const qs = await fetchQuestions({ limit: TOTAL_QUESTIONS, subject: subject || undefined });
      if (qs.length === 0) throw new Error('No questions found — try a different subject filter');
      setQuestions(qs);
      setPhase('ready');
    } catch (e) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => { loadQuestions(''); }, [loadQuestions]);

  const startExam = () => {
    qStartTimes.current[0] = Date.now();
    setPhase('active');
  };

  const handleSelect = (answer) => {
    setAnswers(prev => ({ ...prev, [current]: answer }));
  };

  const handleMark = () => {
    setMarked(prev => {
      const next = new Set(prev);
      next.has(current) ? next.delete(current) : next.add(current);
      return next;
    });
  };

  const handleJump = (index) => {
    // Record time for current question
    if (qStartTimes.current[current]) {
      const elapsed = Math.round((Date.now() - qStartTimes.current[current]) / 1000);
      qStartTimes.current[`time_${current}`] = elapsed;
    }
    qStartTimes.current[index] = Date.now();
    setCurrent(index);
  };

  const handleNext = () => {
    if (current < questions.length - 1) handleJump(current + 1);
  };

  const handlePrev = () => {
    if (current > 0) handleJump(current - 1);
  };

  const handleSubmit = async () => {
    setSubmit(true);
    // Record last question time
    if (qStartTimes.current[current]) {
      const elapsed = Math.round((Date.now() - qStartTimes.current[current]) / 1000);
      qStartTimes.current[`time_${current}`] = elapsed;
    }

    let correct = 0;
    const attemptPayloads = [];
    const subjectBreakdown = {}; // { subject: { correct, total } }

    for (let i = 0; i < questions.length; i++) {
      const q   = questions[i];
      const sel = answers[i] ?? null;
      const isCorrect = sel === q.correct_answer;
      const timeSec   = qStartTimes.current[`time_${i}`] || 0;

      if (isCorrect) correct++;

      // Track per-subject
      if (!subjectBreakdown[q.subject]) subjectBreakdown[q.subject] = { correct: 0, total: 0 };
      subjectBreakdown[q.subject].total += 1;
      if (isCorrect) subjectBreakdown[q.subject].correct += 1;

      attemptPayloads.push({
        question_id:       q.id,
        selected_answer:   sel,
        is_correct:        isCorrect,
        time_taken_sec:    timeSec,
        expected_time_sec: q.expected_time_sec,
        subject:           q.subject,
        topic:             q.topic,
        question_subtype:  q.question_subtype,
        difficulty:        q.difficulty,
        session_id:        sessionId.current,
      });
    }

    // Single batch HTTP call instead of 100 sequential ones
    try {
      await insertAttemptsBatch(attemptPayloads, user.id);
      await insertSession({
        id:              sessionId.current,
        total_questions: questions.length,
        correct_answers: correct,
        total_time:      timeTaken,
        mode:            'exam',
        subject:         subjectFilter || 'General Aptitude',
      }, user.id);
    } catch (_) {}

    setResult({ correct, total: questions.length, timeTaken, subjectBreakdown });
    setPhase('result');
    setSubmit(false);
  };

  // ── PHASE: LOADING ──
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-cet-bg flex flex-col items-center justify-center gap-4">
        {loadError ? (
          <>
            <div className="text-cet-red font-mono text-sm">⚠ {loadError}</div>
            <div className="text-cet-dim text-xs">Check Supabase connection</div>
            <button onClick={loadQuestions} className="mt-2 px-4 py-2 bg-cet-accent text-black rounded font-mono text-sm">Retry</button>
          </>
        ) : (
          <>
            <div className="w-10 h-10 border-2 border-cet-accent border-t-transparent rounded-full animate-spin"/>
            <div className="font-mono text-cet-dim text-sm">Loading {TOTAL_QUESTIONS} questions…</div>
          </>
        )}
      </div>
    );
  }

  // ── PHASE: READY ──
  if (phase === 'ready') {
    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-cet-panel border border-cet-border rounded-2xl p-8 text-center animate-slide-up">
          <div className="text-4xl mb-4">🎯</div>
          <h2 className="font-display text-2xl font-bold text-cet-text mb-2">Exam Mode</h2>
          <p className="text-cet-dim text-sm mb-5">Full MAH MCA CET simulation</p>

          {/* Subject filter */}
          <div className="mb-5 text-left">
            <div className="text-xs font-mono text-cet-dim mb-2">SUBJECT FOCUS</div>
            <div className="space-y-1.5">
              {SUBJECT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setSubjectFilter(opt.value);
                    setAnswers({});
                    setMarked(new Set());
                    setCurrent(0);
                    loadQuestions(opt.value);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm font-mono transition-all
                    ${subjectFilter === opt.value
                      ? 'border-cet-accent bg-cet-accent/10 text-cet-accent'
                      : 'border-cet-border text-cet-dim hover:border-cet-accent/40 hover:text-cet-text'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6 text-center">
            {[
              { label: 'Questions', value: questions.length },
              { label: 'Duration',  value: '90 min' },
              { label: 'Marks',     value: '+1/0' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-cet-bg rounded-lg p-3 border border-cet-border">
                <div className="font-mono font-bold text-cet-accent text-lg">{value}</div>
                <div className="text-xs text-cet-dim font-mono">{label}</div>
              </div>
            ))}
          </div>

          <div className="text-xs text-cet-dim text-left space-y-1 mb-6 font-mono">
            <div>• Navigate freely between questions</div>
            <div>• Mark questions for review (yellow)</div>
            <div>• Timer auto-submits at 90 min</div>
            <div>• No negative marking</div>
          </div>

          <button
            onClick={startExam}
            className="w-full py-3 bg-cet-accent text-black font-display font-bold rounded-lg hover:bg-amber-400 transition-all">
            Start Exam →
          </button>
          <button
            onClick={() => navigate('/')}
            className="mt-3 w-full py-2 text-cet-dim font-mono text-sm hover:text-cet-text transition-all">
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── PHASE: RESULT ──
  if (phase === 'result' && result) {
    const acc  = Math.round((result.correct / result.total) * 100);
    const rank = acc >= 90 ? 'Top 5%' : acc >= 75 ? 'Top 20%' : acc >= 60 ? 'Top 40%' : 'Below 40%';
    const rankColor = acc >= 75 ? 'text-cet-green' : acc >= 60 ? 'text-cet-yellow' : 'text-cet-red';
    const subjectEntries = Object.entries(result.subjectBreakdown || {})
      .map(([subject, d]) => ({ subject, ...d, pct: Math.round((d.correct / d.total) * 100) }))
      .sort((a, b) => b.pct - a.pct);

    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center px-4 py-8">
        <div className="max-w-sm w-full bg-cet-panel border border-cet-border rounded-2xl p-8 animate-slide-up">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">📊</div>
            <h2 className="font-display text-xl font-bold text-cet-text mb-1">Exam Complete</h2>
            <div className={`text-5xl font-display font-extrabold my-2 ${acc >= 70 ? 'text-cet-green' : acc >= 50 ? 'text-cet-yellow' : 'text-cet-red'}`}>
              {acc}%
            </div>
            <div className="text-cet-dim font-mono text-sm">{result.correct}/{result.total} correct</div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-cet-bg rounded-lg p-3 border border-cet-border text-center">
              <div className={`font-mono font-bold text-sm ${rankColor}`}>{rank}</div>
              <div className="text-xs text-cet-dim font-mono mt-0.5">Est. Rank Band</div>
            </div>
            <div className="bg-cet-bg rounded-lg p-3 border border-cet-border text-center">
              <div className="font-mono font-bold text-cet-blue text-sm">{formatTime(result.timeTaken)}</div>
              <div className="text-xs text-cet-dim font-mono mt-0.5">Time Used</div>
            </div>
          </div>

          {/* Per-subject breakdown */}
          {subjectEntries.length > 0 && (
            <div className="mb-5">
              <div className="text-xs font-mono text-cet-dim mb-2 uppercase tracking-widest">Subject Breakdown</div>
              <div className="space-y-2">
                {subjectEntries.map(({ subject, correct: c, total: t, pct }) => (
                  <div key={subject} className="flex items-center gap-2">
                    <div className="text-xs text-cet-dim font-mono w-24 truncate shrink-0">{subject}</div>
                    <div className="flex-1 h-1.5 bg-cet-border rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct >= 70 ? 'bg-cet-green' : pct >= 50 ? 'bg-cet-yellow' : 'bg-cet-red'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className={`font-mono text-xs w-10 text-right shrink-0 ${pct >= 70 ? 'text-cet-green' : pct >= 50 ? 'text-cet-yellow' : 'text-cet-red'}`}>
                      {pct}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => navigate('/analytics')}
              className="flex-1 py-3 border border-cet-border text-cet-dim font-mono text-sm rounded-lg hover:border-cet-accent/50 hover:text-cet-text transition-all">
              Analytics →
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

  // ── PHASE: ACTIVE ──
  const q = questions[current];
  const answered = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-cet-bg font-body pb-6">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-cet-border bg-cet-bg/90 backdrop-blur-sm px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <ProgressBar current={answered} total={questions.length} />
          <div className="shrink-0">
            <Timer
              mode="countdown"
              initialSeconds={EXAM_DURATION}
              running={phase === 'active'}
              reset={0}
              onTick={setTimeTaken}
              onExpire={handleSubmit}
            />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 pt-5 flex flex-col lg:flex-row gap-5">
        {/* Question area */}
        <div className="flex-1 min-w-0">
          <div className="bg-cet-panel border border-cet-border rounded-xl p-5 mb-4">
            <QuestionCard
              question={q}
              selectedAnswer={answers[current]}
              onSelect={handleSelect}
              revealed={false}
              markedForReview={marked.has(current)}
              onMark={handleMark}
              questionNumber={current + 1}
              totalQuestions={questions.length}
            />
          </div>

          {/* Nav buttons */}
          <div className="flex gap-3">
            <button onClick={handlePrev} disabled={current === 0}
              className="px-5 py-3 border border-cet-border text-cet-dim font-mono text-sm rounded-lg disabled:opacity-30 hover:border-cet-accent/40 hover:text-cet-text transition-all">
              ← Prev
            </button>
            <button onClick={handleNext} disabled={current === questions.length - 1}
              className="px-5 py-3 border border-cet-border text-cet-dim font-mono text-sm rounded-lg disabled:opacity-30 hover:border-cet-accent/40 hover:text-cet-text transition-all">
              Next →
            </button>
            <div className="flex-1"/>
            <button
              onClick={() => { if (window.confirm('Submit exam now?')) handleSubmit(); }}
              disabled={submitLoading}
              className="px-6 py-3 bg-cet-accent text-black font-display font-bold text-sm rounded-lg hover:bg-amber-400 transition-all disabled:opacity-50">
              {submitLoading ? 'Submitting…' : 'Submit Exam'}
            </button>
          </div>
        </div>

        {/* Navigation panel */}
        <div className="w-full lg:w-64 shrink-0">
          <NavigationPanel
            total={questions.length}
            answers={answers}
            marked={marked}
            current={current}
            onJump={handleJump}
          />
        </div>
      </div>
    </div>
  );
}
