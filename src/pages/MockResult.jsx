import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { fetchAttemptResult } from '../lib/mockTestApi';
import useMockAnalytics from '../hooks/useMockAnalytics';
import { accuracyColor, formatTimeHuman } from '../utils/helpers';

export default function MockResult() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState([]);

  useEffect(() => {
    fetchAttemptResult(attemptId)
      .then(({ attempt, answers }) => {
        setAttempt(attempt);
        setAnswers(answers);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [attemptId]);

  const analytics = useMockAnalytics(answers);

  if (loading) return <PageState title="Loading results…" />;
  if (error) return <PageState title="Error" subtitle={error} action={() => navigate('/')} />;
  if (!analytics) return null;

  const { total, correct, wrong, skipped, accuracy, totalTime, subjectStats, topicStats, weakTopics, slowQuestions } = analytics;
  const testName = attempt?.mock_tests?.name || 'Mock Test';

  return (
    <div className="min-h-screen bg-cet-bg text-cet-text">
      <AppHeader />
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <div className="bg-cet-panel border border-cet-border rounded-2xl p-6">
          <div className="text-xs font-mono text-cet-dim uppercase">{testName}</div>
          <div className={`text-5xl font-black font-mono ${accuracyColor(accuracy)}`}>{correct}/{total}</div>
          <div className="text-sm font-mono text-cet-dim">Accuracy {accuracy.toFixed(1)}% • Time {formatTimeHuman(totalTime)}</div>
          <div className="grid grid-cols-4 gap-3 mt-4 text-center font-mono text-sm">
            <Stat label="Correct" value={correct} color="text-cet-green" />
            <Stat label="Wrong" value={wrong} color="text-cet-red" />
            <Stat label="Skipped" value={skipped} color="text-cet-dim" />
            <Stat label="Duration" value={`${attempt?.mock_tests?.duration_minutes || 90}m`} />
          </div>
        </div>

        <Section title="Subject accuracy">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {subjectStats.map((s) => (
              <div key={s.subject} className="border border-cet-border rounded-lg p-3 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-cet-text">{s.subject}</span>
                  <span className={accuracyColor(s.accuracy)}>{s.accuracy.toFixed(1)}%</span>
                </div>
                <div className="text-cet-dim text-xs">{s.correct}/{s.total} • avg {s.avgTime.toFixed(1)}s</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Weak topics">
          {weakTopics.length === 0 ? (
            <div className="text-sm text-cet-dim font-mono">No weak topics detected.</div>
          ) : (
            <ul className="space-y-2 text-sm font-mono">
              {weakTopics.map((t) => (
                <li key={t.topic} className="border border-cet-border rounded-lg p-3 flex justify-between">
                  <span>{t.topic} ({t.subject})</span>
                  <span className={accuracyColor(t.accuracy)}>{t.accuracy.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Topic stats">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {topicStats.slice(0, 6).map((t) => (
              <div key={t.topic} className="border border-cet-border rounded-lg p-3 font-mono text-sm flex justify-between">
                <div>
                  <div className="text-cet-text">{t.topic}</div>
                  <div className="text-cet-dim text-xs">{t.subject}</div>
                </div>
                <div className="text-right">
                  <div className={accuracyColor(t.accuracy)}>{t.accuracy.toFixed(1)}%</div>
                  <div className="text-cet-dim text-xs">{t.correct}/{t.total}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={`Slow questions (${slowQuestions.length})`}>
          {slowQuestions.length === 0 && <div className="text-sm text-cet-dim font-mono">None.</div>}
          <ul className="space-y-2 text-sm font-mono">
            {slowQuestions.slice(0, 5).map((q) => (
              <li key={q.id} className="border border-cet-border rounded-lg p-3">
                <div className="text-cet-text mb-1">{q.topic}</div>
                <div className="text-cet-dim text-xs">{q.time_taken_sec}s vs {q.expected_time_sec || 60}s expected</div>
              </li>
            ))}
          </ul>
        </Section>

        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate(`/mock-review/${attemptId}`)} className="px-4 py-2 rounded border border-cet-border font-mono text-sm">Review answers</button>
          <button onClick={() => navigate('/mock-test')} className="px-4 py-2 rounded bg-cet-accent text-white font-mono text-sm">New mock test</button>
          <button onClick={() => navigate('/')} className="px-4 py-2 rounded border border-cet-border font-mono text-sm">Home</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-cet-panel border border-cet-border rounded-xl p-4 space-y-3">
      <div className="font-mono text-xs text-cet-dim uppercase">{title}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="rounded-lg bg-cet-border/40 border border-cet-border p-3">
      <div className={`text-lg font-bold ${color || 'text-cet-text'}`}>{value}</div>
      <div className="text-xs text-cet-dim">{label}</div>
    </div>
  );
}

function PageState({ title, subtitle, action }) {
  return (
    <div className="min-h-screen bg-cet-bg text-cet-text">
      <AppHeader />
      <div className="flex flex-col items-center justify-center h-[70vh] gap-3 font-mono text-sm text-cet-dim">
        <div className="text-3xl">⌛</div>
        <div>{title}</div>
        {subtitle && <div className="text-cet-red text-xs">{subtitle}</div>}
        {action && <button onClick={action} className="px-3 py-2 rounded border border-cet-border">Back</button>}
      </div>
    </div>
  );
}
