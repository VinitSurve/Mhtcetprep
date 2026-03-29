import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import QuestionCard from '../components/QuestionCard';
import { fetchAttemptResult } from '../lib/mockTestApi';
import { accuracyColor } from '../utils/helpers';

export default function MockReview() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetchAttemptResult(attemptId)
      .then(({ attempt, answers }) => {
        const ordered = (answers || [])
          .sort((a, b) => (a.position ?? a.id ?? 0) - (b.position ?? b.id ?? 0))
          .map((a, idx) => ({ ...a, order: idx + 1 }));
        setAttempt(attempt);
        setAnswers(ordered);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [attemptId]);

  const stats = useMemo(() => {
    const total = answers.length;
    const correct = answers.filter(a => a.is_correct).length;
    const wrong = answers.filter(a => a.selected_answer != null && !a.is_correct).length;
    const skipped = answers.filter(a => a.selected_answer == null).length;
    const accuracy = total ? (correct / total) * 100 : 0;
    return { total, correct, wrong, skipped, accuracy };
  }, [answers]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'correct':
        return answers.filter(a => a.is_correct);
      case 'wrong':
        return answers.filter(a => a.selected_answer != null && !a.is_correct);
      case 'skipped':
        return answers.filter(a => a.selected_answer == null);
      case 'marked':
        return answers.filter(a => a.marked_for_review);
      default:
        return answers;
    }
  }, [answers, filter]);

  useEffect(() => {
    if (currentIdx >= filtered.length) {
      setCurrentIdx(0);
    }
  }, [filtered.length, currentIdx]);

  const current = filtered[currentIdx];

  if (loading) return <PageState title="Loading review…" />;
  if (error) return <PageState title="Error" subtitle={error} action={() => navigate('/')} />;
  if (!answers.length) return <PageState title="No answers found" subtitle="Finish a mock test to review answers." action={() => navigate('/mock-test')} />;

  return (
    <div className="min-h-screen bg-cet-bg text-cet-text">
      <AppHeader />

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-cet-panel border border-cet-border rounded-xl p-4 flex flex-wrap gap-4 items-center justify-between">
          <div>
            <div className="text-xs font-mono text-cet-dim uppercase">Mock Review</div>
            <div className="text-xl font-display font-bold">{attempt?.mock_tests?.name || 'Mock Test'}</div>
            <div className="text-xs font-mono text-cet-dim">Attempt #{attempt?.id}</div>
          </div>
          <div className="flex gap-2">
            <Stat label="Accuracy" value={`${stats.accuracy.toFixed(1)}%`} color={accuracyColor(stats.accuracy)} />
            <Stat label="Correct" value={stats.correct} color="text-cet-green" />
            <Stat label="Wrong" value={stats.wrong} color="text-cet-red" />
            <Stat label="Skipped" value={stats.skipped} color="text-cet-dim" />
          </div>
        </div>

        <div className="bg-cet-panel border border-cet-border rounded-xl p-3 flex flex-wrap gap-2 font-mono text-xs">
          <FilterButton active={filter === 'all'} label="All" onClick={() => setFilter('all')} />
          <FilterButton active={filter === 'correct'} label="Correct" onClick={() => setFilter('correct')} />
          <FilterButton active={filter === 'wrong'} label="Wrong" onClick={() => setFilter('wrong')} />
          <FilterButton active={filter === 'skipped'} label="Skipped" onClick={() => setFilter('skipped')} />
          <FilterButton active={filter === 'marked'} label="Marked" onClick={() => setFilter('marked')} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2 max-h-[75vh] overflow-y-auto pr-1">
            {filtered.map((a, idx) => {
              const status = statusMeta(a);
              return (
                <button
                  key={a.id}
                  onClick={() => setCurrentIdx(idx)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${idx === currentIdx ? 'border-cet-blue bg-cet-blue/10' : 'border-cet-border bg-cet-panel hover:border-cet-accent/50'} `}>
                  <div className="flex items-center justify-between mb-1 font-mono text-xs">
                    <span className="text-cet-dim">Q{a.order}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${status.className}`}>{status.label}</span>
                  </div>
                  <div className="text-sm text-cet-text leading-snug line-clamp-2">{a.question}</div>
                  <div className="text-[11px] text-cet-dim font-mono mt-1">{a.subject} · {a.topic}</div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-xs text-cet-dim font-mono p-3 border border-cet-border rounded-lg">No questions in this view.</div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-3">
            {current && (
              <div className="bg-cet-panel border border-cet-border rounded-xl p-4 space-y-3">
                <QuestionCard
                  question={current}
                  selectedAnswer={current.selected_answer}
                  onSelect={null}
                  revealed
                  markedForReview={current.marked_for_review}
                  questionNumber={current.order}
                  totalQuestions={answers.length}
                />

                <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-cet-dim">
                  <Badge label="Your answer" value={current.selected_answer ?? 'Skipped'} className={current.selected_answer ? 'border-cet-border text-cet-text' : 'border-cet-border text-cet-dim'} />
                  <Badge label="Correct" value={current.correct_answer} className="border-cet-green text-cet-green" />
                  {current.marked_for_review && <Badge label="Marked" value="Yes" className="border-cet-yellow text-cet-yellow" />}
                  {current.time_taken_sec != null && <Badge label="Time" value={`${Math.round(current.time_taken_sec)}s`} className="border-cet-border text-cet-text" />}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-cet-border text-sm font-mono">
                  <button
                    onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                    disabled={currentIdx === 0}
                    className="px-4 py-2 rounded border border-cet-border disabled:opacity-40 text-cet-text">
                    ← Prev
                  </button>
                  <div className="text-cet-dim text-xs">{currentIdx + 1} / {filtered.length || 1} in this view</div>
                  <button
                    onClick={() => setCurrentIdx(i => Math.min(filtered.length - 1, i + 1))}
                    disabled={currentIdx >= filtered.length - 1}
                    className="px-4 py-2 rounded border border-cet-border disabled:opacity-40 text-cet-text">
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate(`/mock-result/${attemptId}`)} className="px-4 py-2 rounded border border-cet-border font-mono text-sm">Back to summary</button>
          <button onClick={() => navigate('/mock-test')} className="px-4 py-2 rounded bg-cet-accent text-white font-mono text-sm">Start new mock</button>
          <button onClick={() => navigate('/')} className="px-4 py-2 rounded border border-cet-border font-mono text-sm">Home</button>
        </div>
      </div>
    </div>
  );
}

function statusMeta(ans) {
  if (!ans) return { label: 'Unknown', className: 'bg-cet-border text-cet-dim' };
  if (ans.selected_answer == null) return { label: 'Skipped', className: 'bg-cet-border text-cet-dim' };
  if (ans.is_correct) return { label: 'Correct', className: 'bg-cet-green/20 text-cet-green border border-cet-green/40' };
  return { label: 'Wrong', className: 'bg-cet-red/20 text-cet-red border border-cet-red/40' };
}

function Stat({ label, value, color }) {
  return (
    <div className="px-3 py-2 rounded-lg border border-cet-border bg-cet-border/40 text-center">
      <div className={`text-lg font-bold ${color || 'text-cet-text'}`}>{value}</div>
      <div className="text-[11px] text-cet-dim font-mono">{label}</div>
    </div>
  );
}

function FilterButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded border text-xs ${active ? 'border-cet-accent text-cet-accent bg-cet-accent/10' : 'border-cet-border text-cet-text hover:border-cet-accent/40'}`}>
      {label}
    </button>
  );
}

function Badge({ label, value, className }) {
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded border font-mono text-xs ${className || ''}`}>
      <span className="text-cet-dim">{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}

function PageState({ title, subtitle, action }) {
  return (
    <div className="min-h-screen bg-cet-bg text-cet-text">
      <AppHeader />
      <div className="flex flex-col items-center justify-center h-[70vh] gap-3 font-mono text-sm text-cet-dim">
        <div className="text-3xl">⌛</div>
        <div>{title}</div>
        {subtitle && <div className="text-cet-red text-xs text-center max-w-sm">{subtitle}</div>}
        {action && <button onClick={action} className="px-3 py-2 rounded border border-cet-border">Back</button>}
      </div>
    </div>
  );
}
