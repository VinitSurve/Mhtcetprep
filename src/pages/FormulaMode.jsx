import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import QuestionCard from '../components/QuestionCard';
import ConfidenceModal from '../components/ConfidenceModal';
import FormulaCard from '../components/FormulaCard';
import { fetchFormulaGroups, fetchUserSeenQuestionIds, insertAttempt, insertSession, upsertFormulaProgress } from '../lib/supabase';
import { generateId, speedColor, speedLabel } from '../utils/helpers';

const MAX_Q_PER_FORMULA = 3;

export default function FormulaMode() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const sessionId = useRef(generateId());
  const startRef = useRef(Date.now());
  const sessionSavedRef = useRef(false);
  const seenIdsRef = useRef(new Set());

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [results, setResults] = useState([]);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchFormulaGroups();
        setGroups(data);
        if (user?.id) {
          const seen = await fetchUserSeenQuestionIds(user.id, 5000);
          seenIdsRef.current = new Set(seen);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const currentQ = queue[current] || null;

  const hasResult = useMemo(() => results.length > 0 && current >= queue.length, [results, current, queue.length]);

  useEffect(() => {
    if (!hasResult || sessionSavedRef.current) return;
    sessionSavedRef.current = true;
    finishSession();
  }, [hasResult]);

  function startGroup(group) {
    const filtered = (group.questions || []).filter(q => !seenIdsRef.current.has(q.id));
    const pool = (filtered.length ? filtered : group.questions || []).sort(() => Math.random() - 0.5);
    const questions = pool.slice(0, MAX_Q_PER_FORMULA);
    setSelectedGroup(group);
    setQueue(questions);
    setCurrent(0);
    setSelected(null);
    setRevealed(false);
    setLastResult(null);
    setResults([]);
    startRef.current = Date.now();
    sessionSavedRef.current = false;
  }

  async function handleSubmitMeta({ confidence, wasGuess, errorType }) {
    if (!currentQ) return;
    setShowModal(false);

    const timeTaken = Math.round((Date.now() - startRef.current) / 1000);
    const isCorrect = selected === currentQ.correct_answer;
    const speedRatio = timeTaken / (currentQ.expected_time_sec || 60);

    setLastResult({ isCorrect, timeTaken, speedRatio });
    setResults((prev) => [...prev, { isCorrect, timeTaken }]);

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

      if (currentQ.formula) {
        await upsertFormulaProgress({
          userId: user.id,
          formula: currentQ.formula,
          topic: currentQ.topic,
          isCorrect,
          timeTakenSec: timeTaken,
        });
      }
    } catch (_) {}
  }

  async function finishSession() {
    if (!results.length || !selectedGroup) {
      navigate('/');
      return;
    }

    const total = results.length;
    const correct = results.filter((r) => r.isCorrect).length;
    const totalTime = results.reduce((s, r) => s + r.timeTaken, 0);

    try {
      await insertSession({
        id: sessionId.current,
        total_questions: total,
        correct_answers: correct,
        total_time: totalTime,
        mode: 'formula',
        subject: selectedGroup.subject,
      }, user.id);
    } catch (_) {}
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cet-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-cet-dim font-mono text-sm">Loading formulas...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-cet-red font-mono text-sm mb-3">⚠ {error}</div>
          <button onClick={() => navigate('/')} className="px-4 py-2 bg-cet-accent text-black rounded font-mono text-sm">
            Home
          </button>
        </div>
      </div>
    );
  }

  if (!selectedGroup) {
    return (
      <div className="min-h-screen bg-cet-bg font-body pb-16">
        <header className="sticky top-0 z-10 border-b border-cet-border bg-cet-bg/90 backdrop-blur-sm px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <button onClick={() => navigate('/')} className="text-cet-dim text-sm font-mono hover:text-cet-text">← Exit</button>
            <div className="font-display font-bold text-cet-text">📐 Formula → Application</div>
            <div className="text-xs font-mono text-cet-dim">{groups.length} formulas</div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((g, idx) => (
              <FormulaCard
                key={`${g.formula}-${g.topic}-${idx}`}
                formula={g.formula}
                concept={g.concept}
                topic={g.topic}
                subject={g.subject}
                onStart={() => startGroup(g)}
              />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (hasResult) {
    const total = results.length;
    const correct = results.filter((r) => r.isCorrect).length;
    const acc = total ? Math.round((correct / total) * 100) : 0;

    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-cet-panel border border-cet-border rounded-2xl p-8 text-center animate-slide-up">
          <div className="text-4xl mb-4">📐</div>
          <div className="font-display text-3xl font-extrabold text-cet-accent mb-1">{acc}%</div>
          <div className="text-cet-dim font-mono text-sm mb-5">{correct}/{total} correct for this formula set</div>
          <div className="text-xs font-mono text-cet-muted mb-6">{selectedGroup.formula}</div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setSelectedGroup(null);
                setQueue([]);
                setCurrent(0);
                setResults([]);
                setLastResult(null);
                sessionId.current = generateId();
                sessionSavedRef.current = false;
              }}
              className="flex-1 py-3 border border-cet-border text-cet-dim rounded-lg font-mono text-sm hover:border-cet-accent/40">
              Another Formula
            </button>
            <button
              onClick={async () => {
                navigate('/formula-analytics');
              }}
              className="flex-1 py-3 bg-cet-accent text-black rounded-lg font-display font-bold text-sm hover:bg-amber-400">
              Analytics
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cet-bg font-body pb-20">
      <header className="sticky top-0 z-10 border-b border-cet-border bg-cet-bg/90 backdrop-blur-sm px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <button onClick={() => setSelectedGroup(null)} className="text-cet-dim font-mono text-sm hover:text-cet-text">← Formulas</button>
          <div className="text-sm font-display font-bold text-cet-text truncate max-w-[50%]">{selectedGroup.concept}</div>
          <div className="text-xs font-mono text-cet-dim">{current + 1}/{queue.length}</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-4">
        {lastResult && (
          <div className={`flex items-center gap-3 p-3 rounded-lg border ${lastResult.isCorrect ? 'bg-cet-green/10 border-cet-green/30' : 'bg-cet-red/10 border-cet-red/30'}`}>
            <span>{lastResult.isCorrect ? '✅' : '❌'}</span>
            <span className="text-sm text-cet-text">{lastResult.isCorrect ? 'Correct!' : 'Wrong'}</span>
            <span className="ml-auto font-mono text-xs">
              ⏱ {lastResult.timeTaken}s
              <span className={`ml-2 ${speedColor(lastResult.speedRatio)}`}>{speedLabel(lastResult.speedRatio)}</span>
            </span>
          </div>
        )}

        <FormulaCard formula={selectedGroup.formula} concept={selectedGroup.concept} topic={selectedGroup.topic} subject={selectedGroup.subject} />

        <div className="bg-cet-panel border border-cet-border rounded-xl p-5">
          <QuestionCard
            question={currentQ}
            selectedAnswer={selected}
            onSelect={(v) => !revealed && setSelected(v)}
            revealed={revealed}
            questionNumber={current + 1}
            totalQuestions={queue.length}
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
              className={`w-full py-3 rounded-lg font-display font-bold text-sm ${selected ? 'bg-cet-accent text-black hover:bg-amber-400' : 'bg-cet-border text-cet-muted cursor-not-allowed'}`}>
              Submit Answer
            </button>
          ) : (
            <button
              onClick={() => {
                const next = current + 1;
                if (next >= queue.length) {
                  setCurrent(next);
                  return;
                }
                setCurrent(next);
                setSelected(null);
                setRevealed(false);
                startRef.current = Date.now();
              }}
              className="w-full py-3 rounded-lg bg-cet-accent text-black font-display font-bold text-sm hover:bg-amber-400">
              {current + 1 >= queue.length ? 'Finish Set →' : 'Next Question →'}
            </button>
          )}
        </div>
      </main>

      {showModal && (
        <ConfidenceModal
          isCorrect={selected === currentQ?.correct_answer}
          onSubmit={handleSubmitMeta}
        />
      )}
    </div>
  );
}
