import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';
import QuestionCard from '../components/QuestionCard';
import Timer from '../components/Timer';
import QuestionPalette from '../components/mock/QuestionPalette';
import useMockTest from '../hooks/useMockTest';
import { fetchMockTests } from '../lib/mockTestApi';
import { formatTime } from '../utils/helpers';

export default function MockTest() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const selectedMockId = params.get('testId');
  const [mockList, setMockList] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    fetchMockTests()
      .then((rows) => {
        if (cancelled) return;
        setMockList(rows || []);
        setListError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setListError(e.message);
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => { cancelled = true; };
  }, [setParams]);

  const effectiveMockId = selectedMockId || null;

  const {
    phase,
    mockMeta,
    questions,
    attemptId,
    currentIdx,
    answers,
    marked,
    visited,
    timePerQ,
    durationSec,
    error,
    result,
    startActive,
    goTo,
    selectAnswer,
    toggleMark,
    handleTimeout,
    submit,
  } = useMockTest({ userId: user?.id, mockTestId: effectiveMockId });

  const handleSelectMock = (id) => {
    if (!id || id === effectiveMockId) return;
    const hasProgress = phase === 'active' || (phase === 'ready' && attemptId);
      if (hasProgress) {
        const ok = window.confirm('Switching mocks will start a fresh attempt and your current run will not continue. Continue?');
        if (!ok) return;
      }
      const next = new URLSearchParams(params);
      next.set('testId', id);
      setParams(next);
  };

  useEffect(() => {
    if (phase === 'done' && attemptId) {
      navigate(`/mock-result/${attemptId}`);
    }
  }, [phase, attemptId, navigate]);

  const safeQuestions = Array.isArray(questions) ? questions : [];
  const q = safeQuestions[currentIdx];
  const totalDuration = Math.max(0, durationSec || 0);

  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-cet-bg text-cet-text">
        <AppHeader />
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
          <MockSelector
            mocks={mockList}
            selectedId={effectiveMockId}
            onSelect={handleSelectMock}
            loading={listLoading}
            error={listError}
          />
          <div className="flex flex-col items-center justify-center h-[50vh] gap-3 font-mono text-sm text-cet-dim px-4 text-center border border-cet-border bg-cet-panel rounded-xl">
            <div className="text-4xl">⚠️</div>
            <div className="text-cet-red">{error}</div>
            <button onClick={() => navigate('/')} className="px-4 py-2 rounded border border-cet-border text-cet-text hover:border-cet-accent">Go Home</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cet-bg text-cet-text">
      <AppHeader />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <MockSelector
          mocks={mockList}
          selectedId={effectiveMockId}
          onSelect={handleSelectMock}
          loading={listLoading}
          error={listError}
        />

        {phase === 'idle' && (
          <div className="bg-cet-panel border border-cet-border rounded-xl p-6 font-mono text-sm text-cet-dim flex items-center justify-between">
            <span>Select a mock test above to begin.</span>
            <span className="text-[11px] text-cet-dim">No default auto-selected.</span>
          </div>
        )}

        {phase === 'loading' && (
          <div className="bg-cet-panel border border-cet-border rounded-xl p-6 font-mono text-sm text-cet-dim flex items-center gap-2">
            <span className="text-lg">⌛</span>
            <span>Preparing mock test…</span>
          </div>
        )}

        {phase === 'ready' && (
          <div className="bg-cet-panel border border-cet-border rounded-2xl p-8 space-y-4">
            <div className="text-4xl">🎯</div>
            <h1 className="font-display text-2xl font-bold">Mock Test</h1>
            <p className="text-cet-dim text-sm">Full-length simulation. Every start is a fresh attempt.</p>
            <div className="grid grid-cols-3 gap-3 text-center text-sm font-mono">
              <Stat label="Duration" value={`${mockMeta?.duration_minutes || 90} mins`} />
              <Stat label="Questions" value={questions.length || mockMeta?.total_questions || 100} />
              <Stat label="Marking" value="+1 / 0" />
            </div>
            <ul className="list-disc list-inside text-sm text-cet-dim space-y-1 font-mono">
              <li>No negative marking — attempt all questions.</li>
              <li>Timer auto-submits when it reaches zero.</li>
              <li>Switching mocks discards the current run; attempts never resume.</li>
              <li>Use the palette to jump, mark for review, and track visited questions.</li>
            </ul>
            <button
              onClick={startActive}
              className="w-full py-3 rounded-xl bg-cet-accent text-white font-mono font-bold hover:opacity-90"
            >
              Start Test →
            </button>
          </div>
        )}

        {(phase === 'active' || phase === 'submitting') && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-cet-panel border border-cet-border rounded-xl px-4 py-3">
              <div className="font-mono text-xs text-cet-dim">Q{currentIdx + 1}/{questions.length}</div>
              <Timer
                mode="countdown"
                initialSeconds={totalDuration}
                onExpire={handleTimeout}
                running={phase === 'active'}
                reset={attemptId}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-cet-dim">Answered {answers.size}/{questions.length}</span>
                <button
                  onClick={submit}
                  className="px-3 py-2 rounded-lg bg-cet-accent text-white font-mono text-xs hover:opacity-90"
                  disabled={phase === 'submitting'}
                >
                  {phase === 'submitting' ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-4">
                {q && (
                  <QuestionCard
                    question={q}
                    selectedAnswer={answers.get(q.id) ?? null}
                    onSelect={(ans) => selectAnswer(q.id, ans)}
                    revealed={false}
                    markedForReview={marked.has(q.id)}
                    onMark={() => toggleMark(q.id)}
                    questionNumber={currentIdx + 1}
                    totalQuestions={questions.length}
                  />
                )}

                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => goTo(currentIdx - 1)}
                    disabled={currentIdx === 0}
                    className="px-4 py-2 rounded border border-cet-border text-cet-text font-mono text-sm disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <div className="text-xs font-mono text-cet-dim">
                    Time spent on this question: {formatTime(timePerQ.get(q?.id) || 0)}
                  </div>
                  <button
                    onClick={() => goTo(currentIdx + 1)}
                    disabled={currentIdx === questions.length - 1}
                    className="px-4 py-2 rounded border border-cet-border text-cet-text font-mono text-sm disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>

              <QuestionPalette
                questions={questions}
                currentIndex={currentIdx}
                answers={answers}
                marked={marked}
                visited={visited}
                onJump={goTo}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MockSelector({ mocks, selectedId, onSelect, loading, error }) {
  const slots = Array.from({ length: 10 }).map((_, idx) => mocks[idx] || null);

  return (
    <div className="bg-cet-panel border border-cet-border rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-xs text-cet-dim uppercase">Choose a mock</div>
          <div className="text-sm font-mono text-cet-text">Fresh attempt every switch</div>
        </div>
        {loading && <div className="text-xs font-mono text-cet-dim">Loading…</div>}
        {error && <div className="text-xs font-mono text-cet-red">{error}</div>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {loading && Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className="h-20 rounded-lg border border-cet-border bg-cet-border/40 animate-pulse" />
        ))}

        {!loading && slots.map((mock, idx) => {
          if (!mock) {
            return (
              <div key={`slot-${idx}`} className="text-left p-3 rounded-lg border border-dashed border-cet-border text-cet-dim font-mono text-xs bg-cet-panel/60">
                <div className="text-cet-dim">Mock {idx + 1}</div>
                <div className="text-[11px] text-cet-dim">Not available</div>
              </div>
            );
          }

          const active = mock.id === selectedId;
          return (
            <button
              key={mock.id}
              onClick={() => onSelect(mock.id)}
              className={`text-left p-3 rounded-lg border transition-all ${active ? 'border-cet-blue bg-cet-blue/10' : 'border-cet-border hover:border-cet-accent/60'}`}
            >
              <div className="font-mono text-xs text-cet-dim">Mock {idx + 1}</div>
              <div className="font-mono text-sm text-cet-text truncate">{mock.name || 'Mock Test'}</div>
              <div className="font-mono text-[11px] text-cet-dim">{mock.duration_minutes || 90} mins · {mock.total_questions || '—'} Qs</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-cet-border/40 border border-cet-border p-3 text-center">
      <div className="font-mono text-xs text-cet-dim">{label}</div>
      <div className="font-mono text-lg font-bold text-cet-text">{value}</div>
    </div>
  );
}
