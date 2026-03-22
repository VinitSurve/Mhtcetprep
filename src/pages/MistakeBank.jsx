import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import QuestionCard from '../components/QuestionCard';
import ConfidenceModal from '../components/ConfidenceModal';
import { fetchMistakeQuestions, insertAttempt, insertSession } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { generateId } from '../utils/helpers';

export default function MistakeBank() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [phase, setPhase]         = useState('loading');
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent]     = useState(0);
  const [selected, setSelected]   = useState(null);
  const [revealed, setRevealed]   = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [results, setResults]     = useState([]);
  const [loadError, setLoadError] = useState(null);

  const sessionId  = useRef(generateId());
  const startRef   = useRef(Date.now());

  useEffect(() => {
    fetchMistakeQuestions(30)
      .then(qs => {
        if (qs.length === 0) { setPhase('empty'); return; }
        setQuestions(qs);
        setPhase('ready');
      })
      .catch(e => { setLoadError(e.message); setPhase('error'); });
  }, []);

  const handleSubmit = () => {
    if (!selected) return;
    setRevealed(true);
    setShowModal(true);
  };

  const handleModalSubmit = async ({ confidence, wasGuess, errorType }) => {
    setShowModal(false);
    const q         = questions[current];
    const timeTaken = Math.round((Date.now() - startRef.current) / 1000);
    const isCorrect = selected === q.correct_answer;

    setResults(prev => [...prev, { isCorrect, topic: q.topic }]);

    try {
      await insertAttempt({
        question_id:       q.id,
        selected_answer:   selected,
        is_correct:        isCorrect,
        time_taken_sec:    timeTaken,
        expected_time_sec: q.expected_time_sec,
        subject:           q.subject,
        topic:             q.topic,
        question_subtype:  q.question_subtype,
        difficulty:        q.difficulty,
        confidence_level:  confidence,
        was_guess:         wasGuess,
        error_type:        errorType,
        session_id:        sessionId.current,
      }, user.id);
    } catch (e) { console.error(e); }
  };

  const handleNext = () => {
    if (current + 1 >= questions.length) {
      const correct = results.filter(r => r.isCorrect).length;
      insertSession({
        id:              sessionId.current,
        total_questions: questions.length,
        correct_answers: correct,
        total_time:      0,
        mode:            'mistake',
      }, user.id).catch(() => {});
      setPhase('result');
      return;
    }
    setCurrent(c => c + 1);
    setSelected(null);
    setRevealed(false);
    startRef.current = Date.now();
  };

  if (phase === 'loading') return (
    <div className="min-h-screen bg-cet-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-cet-accent border-t-transparent rounded-full animate-spin"/>
        <span className="text-cet-dim font-mono text-sm">Loading mistake bank…</span>
      </div>
    </div>
  );

  if (phase === 'empty') return (
    <div className="min-h-screen bg-cet-bg flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-5xl mb-4">🎉</div>
        <div className="font-display text-xl font-bold text-cet-green mb-2">Clean Slate!</div>
        <div className="text-cet-dim text-sm font-mono mb-6">No incorrect attempts found yet.</div>
        <button onClick={() => navigate('/')} className="px-6 py-3 bg-cet-accent text-black font-display font-bold rounded-lg">
          Start Practicing
        </button>
      </div>
    </div>
  );

  if (phase === 'error') return (
    <div className="min-h-screen bg-cet-bg flex items-center justify-center">
      <div className="text-center">
        <div className="text-cet-red font-mono text-sm">⚠ {loadError}</div>
        <button onClick={() => navigate('/')} className="mt-4 px-4 py-2 bg-cet-accent text-black rounded font-mono text-sm">Home</button>
      </div>
    </div>
  );

  if (phase === 'result') {
    const correct = results.filter(r => r.isCorrect).length;
    const acc = Math.round((correct / results.length) * 100);
    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-cet-panel border border-cet-border rounded-2xl p-8 text-center animate-slide-up">
          <div className="text-4xl mb-4">🔁</div>
          <div className="font-display text-3xl font-extrabold text-cet-accent mb-1">{acc}%</div>
          <div className="text-cet-dim font-mono text-sm mb-6">{correct}/{results.length} corrected</div>
          {acc >= 70
            ? <div className="text-cet-green text-sm font-mono mb-6">Great improvement! Keep it up.</div>
            : <div className="text-cet-yellow text-sm font-mono mb-6">Keep revisiting these topics.</div>
          }
          <div className="flex gap-3">
            <button onClick={() => navigate('/analytics')}
              className="flex-1 py-3 border border-cet-border text-cet-dim font-mono text-sm rounded-lg hover:border-cet-accent/40 transition-all">
              Analytics
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

  if (phase === 'ready' && current === 0) {
    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-cet-panel border border-cet-border rounded-2xl p-8 text-center animate-slide-up">
          <div className="text-4xl mb-4">🔁</div>
          <h2 className="font-display text-2xl font-bold text-cet-text mb-2">Mistake Bank</h2>
          <p className="text-cet-dim text-sm mb-1">{questions.length} questions you got wrong</p>
          <p className="text-xs text-cet-dim font-mono mb-6">Fix your errors. Improve your score.</p>
          <button onClick={() => { startRef.current = Date.now(); setPhase('active'); }}
            className="w-full py-3 bg-cet-accent text-black font-display font-bold rounded-lg hover:bg-amber-400 transition-all">
            Start Retry Session
          </button>
          <button onClick={() => navigate('/')} className="mt-3 w-full py-2 text-cet-dim font-mono text-sm hover:text-cet-text transition-all">
            ← Back
          </button>
        </div>
      </div>
    );
  }

  const q = questions[current];

  return (
    <div className="min-h-screen bg-cet-bg font-body pb-20">
      <header className="sticky top-0 z-10 border-b border-cet-border bg-cet-bg/90 backdrop-blur-sm px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button onClick={() => navigate('/')} className="text-cet-dim font-mono text-sm hover:text-cet-text">← Exit</button>
          <div className="font-display font-bold text-cet-text text-sm">🔁 Mistake Bank</div>
          <span className="font-mono text-xs text-cet-dim">{current + 1}/{questions.length}</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6">
        <div className="bg-cet-panel border border-cet-border rounded-xl p-5 mb-4">
          <QuestionCard
            question={q}
            selectedAnswer={selected}
            onSelect={v => !revealed && setSelected(v)}
            revealed={revealed}
            questionNumber={current + 1}
            totalQuestions={questions.length}
          />
        </div>

        <div className="flex gap-3">
          {!revealed ? (
            <button onClick={handleSubmit} disabled={!selected}
              className={`w-full py-3 rounded-lg font-display font-bold text-sm transition-all
                ${selected ? 'bg-cet-accent text-black hover:bg-amber-400' : 'bg-cet-border text-cet-muted cursor-not-allowed'}`}>
              Submit Answer
            </button>
          ) : (
            <button onClick={handleNext}
              className="w-full py-3 rounded-lg bg-cet-accent text-black font-display font-bold text-sm hover:bg-amber-400 transition-all">
              {current + 1 >= questions.length ? 'See Results →' : 'Next Question →'}
            </button>
          )}
        </div>
      </main>

      {showModal && (
        <ConfidenceModal
          isCorrect={selected === q?.correct_answer}
          onSubmit={handleModalSubmit}
        />
      )}
    </div>
  );
}
