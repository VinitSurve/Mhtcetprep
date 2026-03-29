import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import QuestionCard from '../components/QuestionCard';
import ConfidenceModal from '../components/ConfidenceModal';
import RevisionCard from '../components/RevisionCard';
import { fetchQuestionsByIds, fetchRevisionSignals, insertAttempt, insertSession } from '../lib/supabase';
import { isAnswerCorrect } from '../utils/helpers';
import { generateRevisionSet } from '../utils/adaptiveEngine';
import { generateId } from '../utils/helpers';

export default function Revision() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const sessionId = useRef(generateId());
  const startRef = useRef(Date.now());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('pick');

  const [revisionSet, setRevisionSet] = useState([]);
  const [questionMap, setQuestionMap] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);

  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [results, setResults] = useState([]);

  const currentItem = queue[current] || null;
  const currentQuestion = currentItem ? questionMap[currentItem.question_id] : null;

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const signals = await fetchRevisionSignals(80);
        const set = generateRevisionSet(signals, 10, 20);
        const questions = await fetchQuestionsByIds(set.map((s) => s.question_id));
        const qMap = {};
        for (const q of questions) qMap[q.id] = q;

        const filtered = set.filter((s) => qMap[s.question_id]);
        setRevisionSet(filtered);
        setQuestionMap(qMap);
        setSelectedIds(filtered.slice(0, 10).map((s) => s.question_id));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedCards = useMemo(() => {
    const idSet = new Set(selectedIds);
    return revisionSet.filter((s) => idSet.has(s.question_id));
  }, [revisionSet, selectedIds]);

  function togglePick(qid) {
    setSelectedIds((prev) => {
      const exists = prev.includes(qid);
      if (exists) return prev.filter((x) => x !== qid);
      if (prev.length >= 20) return prev;
      return [...prev, qid];
    });
  }

  function startRevision() {
    if (!selectedCards.length) return;
    setQueue(selectedCards);
    setCurrent(0);
    setSelected(null);
    setRevealed(false);
    setResults([]);
    sessionId.current = generateId();
    startRef.current = Date.now();
    setPhase('active');
  }

  async function handleMetaSubmit({ confidence, wasGuess, errorType }) {
    if (!currentQuestion) return;
    setShowModal(false);

    const timeTaken = Math.round((Date.now() - startRef.current) / 1000);
    const isCorrect = isAnswerCorrect(currentQuestion, selected);

    setResults((prev) => [...prev, {
      isCorrect,
      timeTaken,
      topic: currentQuestion.topic,
      reasons: currentItem.reasons,
    }]);

    try {
      await insertAttempt({
        question_id: currentQuestion.id,
        selected_answer: selected,
        is_correct: isCorrect,
        time_taken_sec: timeTaken,
        expected_time_sec: currentQuestion.expected_time_sec,
        subject: currentQuestion.subject,
        topic: currentQuestion.topic,
        question_subtype: currentQuestion.question_subtype,
        difficulty: currentQuestion.difficulty,
        confidence_level: confidence,
        was_guess: wasGuess,
        error_type: errorType,
        session_id: sessionId.current,
      }, user.id);
    } catch (_) {}
  }

  async function finishRevision() {
    const total = results.length;
    const correct = results.filter((r) => r.isCorrect).length;
    const totalTime = results.reduce((s, r) => s + r.timeTaken, 0);

    const topicCounts = {};
    for (const r of results) {
      if (!topicCounts[r.topic]) topicCounts[r.topic] = 0;
      if (!r.isCorrect) topicCounts[r.topic] += 1;
    }
    const weakest = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'General Aptitude';

    try {
      await insertSession({
        id: sessionId.current,
        total_questions: total,
        correct_answers: correct,
        total_time: totalTime,
        mode: 'revision',
        subject: weakest,
      }, user.id);
    } catch (_) {}

    setPhase('result');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cet-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-cet-dim font-mono text-sm">Generating your daily revision set...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-cet-red font-mono text-sm mb-3">⚠ {error}</div>
          <button onClick={() => navigate('/')} className="px-4 py-2 bg-cet-accent text-black rounded font-mono text-sm">Home</button>
        </div>
      </div>
    );
  }

  if (phase === 'pick') {
    return (
      <div className="min-h-screen bg-cet-bg font-body pb-16">
        <header className="sticky top-0 z-10 border-b border-cet-border bg-cet-bg/90 backdrop-blur-sm px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <button onClick={() => navigate('/')} className="text-cet-dim text-sm font-mono hover:text-cet-text">← Exit</button>
            <div className="font-display font-bold text-cet-text">🔁 Smart Revision</div>
            <div className="text-xs font-mono text-cet-dim">{selectedIds.length} selected</div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 pt-6">
          <div className="mb-4 text-sm text-cet-dim font-mono">Pick 10 to 20 questions for today's revision.</div>
          <div className="space-y-3 mb-6">
            {revisionSet.map((item) => {
              const q = questionMap[item.question_id];
              if (!q) return null;
              return (
                <RevisionCard
                  key={item.question_id}
                  question={q}
                  reasons={item.reasons}
                  selected={selectedIds.includes(item.question_id)}
                  onSelect={() => togglePick(item.question_id)}
                />
              );
            })}
          </div>

          <button
            onClick={startRevision}
            disabled={selectedIds.length < 10}
            className={`w-full py-3 rounded-lg font-display font-bold text-sm ${
              selectedIds.length >= 10
                ? 'bg-cet-accent text-black hover:bg-amber-400'
                : 'bg-cet-border text-cet-muted cursor-not-allowed'
            }`}>
            Start Daily Revision
          </button>
        </main>
      </div>
    );
  }

  if (phase === 'result') {
    const total = results.length;
    const correct = results.filter((r) => r.isCorrect).length;
    const acc = total ? Math.round((correct / total) * 100) : 0;
    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-cet-panel border border-cet-border rounded-2xl p-8 text-center animate-slide-up">
          <div className="text-4xl mb-4">🔁</div>
          <div className="font-display text-3xl font-extrabold text-cet-accent mb-1">{acc}%</div>
          <div className="text-cet-dim font-mono text-sm mb-6">{correct}/{total} revised correctly</div>
          <div className="flex gap-3">
            <button onClick={() => setPhase('pick')} className="flex-1 py-3 border border-cet-border rounded-lg text-cet-dim font-mono text-sm">New Set</button>
            <button onClick={() => navigate('/analytics')} className="flex-1 py-3 bg-cet-accent text-black rounded-lg font-display font-bold text-sm">Analytics</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cet-bg font-body pb-20">
      <header className="sticky top-0 z-10 border-b border-cet-border bg-cet-bg/90 backdrop-blur-sm px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button onClick={finishRevision} className="text-cet-dim text-sm font-mono hover:text-cet-text">← Finish</button>
          <div className="font-display font-bold text-cet-text">Daily Revision</div>
          <div className="text-xs font-mono text-cet-dim">{current + 1}/{queue.length}</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-4">
        {currentItem && (
          <div className="flex flex-wrap gap-1.5">
            {currentItem.reasons.map((r) => (
              <span
                key={r}
                className={`text-xs font-mono px-2 py-0.5 rounded border ${
                  r === 'wrong'
                    ? 'border-cet-red/40 text-cet-red bg-cet-red/10'
                    : r === 'slow'
                    ? 'border-cet-yellow/40 text-cet-yellow bg-cet-yellow/10'
                    : 'border-cet-blue/40 text-cet-blue bg-cet-blue/10'
                }`}>
                {r === 'wrong' ? 'You got this wrong' : r === 'slow' ? 'You were too slow' : 'You were not confident'}
              </span>
            ))}
          </div>
        )}

        <div className="bg-cet-panel border border-cet-border rounded-xl p-5">
          <QuestionCard
            question={currentQuestion}
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
              className={`w-full py-3 rounded-lg font-display font-bold text-sm ${
                selected ? 'bg-cet-accent text-black hover:bg-amber-400' : 'bg-cet-border text-cet-muted cursor-not-allowed'
              }`}>
              Submit Answer
            </button>
          ) : (
            <button
              onClick={() => {
                const next = current + 1;
                if (next >= queue.length) {
                  finishRevision();
                  return;
                }
                setCurrent(next);
                setSelected(null);
                setRevealed(false);
                startRef.current = Date.now();
              }}
              className="w-full py-3 rounded-lg bg-cet-accent text-black font-display font-bold text-sm hover:bg-amber-400">
              {current + 1 >= queue.length ? 'Finish Revision →' : 'Next Question →'}
            </button>
          )}
        </div>
      </main>

      {showModal && (
        <ConfidenceModal
          isCorrect={isAnswerCorrect(currentQuestion, selected)}
          onSubmit={handleMetaSubmit}
        />
      )}
    </div>
  );
}
