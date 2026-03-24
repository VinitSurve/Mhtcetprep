import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import QuestionCard from '../components/QuestionCard';
import ProgressBar from '../components/ProgressBar';
import ConfidenceModal from '../components/ConfidenceModal';
import Timer from '../components/Timer';
import { fetchQuestions, fetchRecentAttempts, insertAttempt, insertSession } from '../lib/supabase';
import { buildSubjectMasteryPool } from '../utils/adaptiveEngine';
import { generateId } from '../utils/helpers';

const SUBJECTS = [
  'Mathematics',
  'Logical Reasoning',
  'English',
  'Computer Concepts',
  'General Aptitude',
];

const TOTAL_Q = 50;

export default function SubjectMastery() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const sessionId = useRef(generateId());
  const startRef = useRef(Date.now());

  const [subject, setSubject] = useState('');
  const [timed, setTimed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('pick');

  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [results, setResults] = useState([]);
  const [elapsed, setElapsed] = useState(0);

  const currentQ = questions[current] || null;

  const weakTopics = useMemo(() => {
    const map = {};
    for (const r of results) {
      const key = r.topic;
      if (!map[key]) map[key] = { total: 0, correct: 0 };
      map[key].total += 1;
      if (r.isCorrect) map[key].correct += 1;
    }
    return Object.entries(map)
      .map(([topic, d]) => ({ topic, acc: d.total ? (d.correct / d.total) * 100 : 0 }))
      .filter((x) => x.acc < 60)
      .sort((a, b) => a.acc - b.acc)
      .slice(0, 3);
  }, [results]);

  async function startMastery() {
    if (!subject) return;
    setLoading(true);
    setError('');
    try {
      const [allSubjectQuestions, recentAttempts] = await Promise.all([
        fetchQuestions({ limit: 250, subject }),
        fetchRecentAttempts(500),
      ]);

      const pool = buildSubjectMasteryPool(allSubjectQuestions, recentAttempts, subject);
      const picked = [];
      const seen = new Set();

      for (const q of pool) {
        if (picked.length >= TOTAL_Q) break;
        if (seen.has(q.id)) continue;
        seen.add(q.id);
        picked.push(q);
      }

      if (picked.length < TOTAL_Q) {
        for (const q of allSubjectQuestions) {
          if (picked.length >= TOTAL_Q) break;
          if (seen.has(q.id)) continue;
          seen.add(q.id);
          picked.push(q);
        }
      }

      if (!picked.length) throw new Error('No questions found for selected subject.');

      setQuestions(picked.slice(0, TOTAL_Q));
      setCurrent(0);
      setSelected(null);
      setRevealed(false);
      setResults([]);
      setElapsed(0);
      startRef.current = Date.now();
      sessionId.current = generateId();
      setPhase('active');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMetaSubmit({ confidence, wasGuess, errorType }) {
    if (!currentQ) return;
    setShowModal(false);

    const timeTaken = Math.round((Date.now() - startRef.current) / 1000);
    const isCorrect = selected === currentQ.correct_answer;

    setResults((prev) => [...prev, { isCorrect, timeTaken, topic: currentQ.topic }]);

    try {
      await insertAttempt({
        question_id: currentQ.id,
        selected_answer: selected,
        is_correct: isCorrect,
        time_taken_sec: timeTaken,
        expected_time_sec: currentQ.expected_time_sec,
        subject: currentQ.subject,
        topic: currentQ.topic,
        question_subtype: currentQ.question_subtype,
        difficulty: currentQ.difficulty,
        confidence_level: confidence,
        was_guess: wasGuess,
        error_type: errorType,
        session_id: sessionId.current,
      }, user.id);
    } catch (_) {}
  }

  async function finish() {
    const total = results.length;
    const correct = results.filter((r) => r.isCorrect).length;
    const totalTime = results.reduce((s, r) => s + r.timeTaken, 0);
    try {
      await insertSession({
        id: sessionId.current,
        total_questions: total,
        correct_answers: correct,
        total_time: totalTime,
        mode: 'mastery',
        subject,
      }, user.id);
    } catch (_) {}
    setPhase('result');
  }

  useEffect(() => {
    if (!timed || phase !== 'active') return;
    if (elapsed >= TOTAL_Q * 60) finish();
  }, [elapsed, timed, phase]);

  if (phase === 'pick') {
    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-cet-panel border border-cet-border rounded-2xl p-8 animate-slide-up">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">📚</div>
            <h1 className="font-display text-2xl font-bold text-cet-text">Subject Mastery Mode</h1>
            <p className="text-cet-dim text-sm mt-1">50-question deep dive with weak-topic targeting</p>
          </div>

          {error && <div className="mb-4 p-3 rounded-lg bg-cet-red/10 border border-cet-red/30 text-cet-red text-xs font-mono">{error}</div>}

          <div className="space-y-2 mb-5">
            {SUBJECTS.map((s) => (
              <button
                key={s}
                onClick={() => setSubject(s)}
                className={`w-full text-left px-4 py-2.5 rounded-lg border font-mono text-sm transition-all ${
                  subject === s
                    ? 'border-cet-accent bg-cet-accent/10 text-cet-accent'
                    : 'border-cet-border text-cet-dim hover:border-cet-accent/40 hover:text-cet-text'
                }`}>
                {s}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 mb-6 text-xs font-mono text-cet-dim">
            <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
            Timed session (50 minutes target)
          </label>

          <div className="flex gap-3">
            <button onClick={() => navigate('/')} className="flex-1 py-3 border border-cet-border rounded-lg text-cet-dim font-mono text-sm">Cancel</button>
            <button
              onClick={startMastery}
              disabled={!subject || loading}
              className={`flex-1 py-3 rounded-lg font-display font-bold text-sm ${
                subject && !loading ? 'bg-cet-accent text-black hover:bg-amber-400' : 'bg-cet-border text-cet-muted'
              }`}>
              {loading ? 'Loading...' : 'Start'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'result') {
    const total = results.length;
    const correct = results.filter((r) => r.isCorrect).length;
    const acc = total ? Math.round((correct / total) * 100) : 0;
    const avgTime = total ? Math.round(results.reduce((s, r) => s + r.timeTaken, 0) / total) : 0;

    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-cet-panel border border-cet-border rounded-2xl p-8 text-center animate-slide-up">
          <div className="text-4xl mb-4">🏁</div>
          <div className="font-display text-3xl font-extrabold text-cet-accent mb-1">{acc}%</div>
          <div className="text-cet-dim text-sm font-mono mb-5">{correct}/{total} correct · avg {avgTime}s</div>

          <div className="text-left mb-6">
            <div className="text-xs font-mono text-cet-dim uppercase tracking-widest mb-2">Weak Topics</div>
            {weakTopics.length ? weakTopics.map((w) => (
              <div key={w.topic} className="flex items-center justify-between text-sm py-1 border-b border-cet-border/40">
                <span className="text-cet-text">{w.topic}</span>
                <span className="font-mono text-cet-red">{Math.round(w.acc)}%</span>
              </div>
            )) : <div className="text-xs text-cet-green font-mono">No weak topics in this session.</div>}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setPhase('pick')} className="flex-1 py-3 border border-cet-border rounded-lg text-cet-dim font-mono text-sm">Retry</button>
            <button onClick={() => navigate('/analytics')} className="flex-1 py-3 bg-cet-accent text-black rounded-lg font-display font-bold text-sm">Analytics</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cet-bg font-body pb-20">
      <header className="sticky top-0 z-10 border-b border-cet-border bg-cet-bg/90 backdrop-blur-sm px-4 py-3">
        <div className="max-w-3xl mx-auto space-y-2">
          <div className="flex items-center justify-between">
            <button onClick={finish} className="text-cet-dim text-sm font-mono hover:text-cet-text">← End Session</button>
            <div className="font-display font-bold text-cet-text">📚 {subject}</div>
            <div className="text-xs font-mono text-cet-dim">{current + 1}/{questions.length}</div>
          </div>
          <ProgressBar current={current + 1} total={questions.length} />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-4">
        {timed && (
          <div className="bg-cet-panel border border-cet-border rounded-lg px-4 py-3 flex justify-center">
            <Timer mode="countup" running={phase === 'active'} onTick={setElapsed} />
          </div>
        )}

        <div className="bg-cet-panel border border-cet-border rounded-xl p-5">
          <QuestionCard
            question={currentQ}
            selectedAnswer={selected}
            onSelect={(v) => !revealed && setSelected(v)}
            revealed={revealed}
            questionNumber={current + 1}
            totalQuestions={questions.length}
          />
        </div>

        <div className="flex gap-3">
          {!revealed ? (
            <button
              onClick={() => {
                if (!selected) return;
                setRevealed(true);
                setShowModal(true);
              }}
              disabled={!selected}
              className={`w-full py-3 rounded-lg font-display font-bold text-sm ${
                selected ? 'bg-cet-accent text-black hover:bg-amber-400' : 'bg-cet-border text-cet-muted cursor-not-allowed'
              }`}>
              Submit Answer
            </button>
          ) : (
            <button
              onClick={() => {
                const next = current + 1;
                if (next >= questions.length) {
                  finish();
                  return;
                }
                setCurrent(next);
                setSelected(null);
                setRevealed(false);
                startRef.current = Date.now();
              }}
              className="w-full py-3 rounded-lg bg-cet-accent text-black font-display font-bold text-sm hover:bg-amber-400">
              {current + 1 >= questions.length ? 'Finish Mastery Session →' : 'Next Question →'}
            </button>
          )}
        </div>
      </main>

      {showModal && (
        <ConfidenceModal
          isCorrect={selected === currentQ?.correct_answer}
          onSubmit={handleMetaSubmit}
        />
      )}
    </div>
  );
}
