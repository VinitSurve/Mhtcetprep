import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import AppHeader from '../components/AppHeader';
import { fetchFormulaAnalytics, fetchFormulaProgress } from '../lib/supabase';
import { buildFormulaPerformance, getWeakFormulas } from '../utils/adaptiveEngine';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7'];

export default function FormulaAnalytics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [perf, setPerf] = useState([]);
  const [weak, setWeak] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [formulaAttempts, formulaProgress] = await Promise.all([
          fetchFormulaAnalytics(2000),
          fetchFormulaProgress(500),
        ]);
        setPerf(buildFormulaPerformance(formulaAttempts));
        setWeak(getWeakFormulas(formulaProgress, 10));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sortedPerf = useMemo(
    () => [...perf].sort((a, b) => a.accuracy - b.accuracy),
    [perf]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cet-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-cet-dim font-mono text-sm">Computing formula analytics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-cet-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-cet-red font-mono text-sm mb-3">⚠ {error}</div>
          <button onClick={() => navigate('/')} className="px-4 py-2 bg-cet-accent text-black rounded font-mono text-sm">Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cet-bg font-body pb-10">
      <AppHeader title="Formula Analytics" subtitle="Track concept-level readiness and weak formulas" />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-cet-panel border border-cet-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-bold text-cet-text">Formula Performance</h2>
            <button onClick={() => navigate('/formula')} className="text-xs font-mono text-cet-accent hover:underline">Go to Formula Mode →</button>
          </div>
          {sortedPerf.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sortedPerf.slice(0, 15)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                <XAxis dataKey="topic" tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'JetBrains Mono' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'JetBrains Mono' }} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#161b27', border: '1px solid #1e2535', borderRadius: '8px', color: '#e2e8f0', fontSize: '11px', fontFamily: 'JetBrains Mono' }}
                  formatter={(value, name, props) => {
                    if (name === 'accuracy') return [`${value}%`, 'Accuracy'];
                    if (name === 'avgTime') return [`${value}s`, 'Avg Time'];
                    return [value, name];
                  }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.formula || ''}
                />
                <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                  {sortedPerf.slice(0, 15).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-cet-dim text-sm font-mono">No formula attempts yet. Practice Formula Mode first.</div>
          )}
        </div>

        <div className="bg-cet-panel border border-cet-border rounded-xl p-5">
          <h2 className="font-display text-lg font-bold text-cet-text mb-3">Weakest Formulas</h2>
          {weak.length ? (
            <div className="space-y-2">
              {weak.map((w) => (
                <div key={`${w.formula}-${w.topic}`} className="p-3 rounded-lg border border-cet-border bg-cet-bg">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="text-sm text-cet-text break-words">{w.formula}</div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-cet-red/10 border border-cet-red/30 text-cet-red">
                      {Math.round(w.accuracy)}%
                    </span>
                  </div>
                  <div className="text-xs text-cet-dim font-mono">
                    {w.topic} · {w.attempts} attempts · avg {w.avgTime}s
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-cet-dim text-sm font-mono">No weak formulas detected yet.</div>
          )}
        </div>
      </main>
    </div>
  );
}
