import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend, ReferenceLine,
} from 'recharts';
import { fetchAnalytics } from '../lib/supabase';
import { fetchMockAttemptSummaries } from '../lib/mockTestApi';
import {
  computeOverallMetrics, analyzeAttempts,
  buildSessionTrend, buildErrorDistribution, buildConfidenceMatrix,
  buildDifficultyStats, buildSpeedAccuracyMatrix, buildStreakData,
  buildHourlyHeatmap, buildTopicCoverage, predictScore, buildWeeklyVolume,
  findStrongestTopic, findWeakestTopic, findSlowestTopic,
  buildSubjectMasteryScore,
} from '../utils/adaptiveEngine';
import { accuracyColor, subjectColor } from '../utils/helpers';
import AppHeader from '../components/AppHeader';

const CHART_COLORS = ['#3b82f6','#a855f7','#10b981','#f59e0b','#ef4444'];

const TT = {
  contentStyle: {
    backgroundColor: '#161b27', border: '1px solid #1e2535',
    borderRadius: '8px', color: '#e2e8f0',
    fontSize: '11px', fontFamily: 'JetBrains Mono',
  },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
};

function Section({ title, children }) {
  return (
    <div className="bg-cet-panel border border-cet-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-cet-border">
        <span className="font-mono text-xs text-cet-dim uppercase tracking-widest">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function KPICard({ label, value, color = 'text-cet-text', sub }) {
  return (
    <div className="bg-cet-panel border border-cet-border rounded-xl p-4 text-center">
      <div className={`font-mono text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-cet-dim font-mono mt-0.5">{label}</div>
      {sub && <div className="text-xs text-cet-muted font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Analytics() {
  const navigate = useNavigate();
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [attempts, setAttempts]   = useState([]);
  const [metrics, setMetrics]     = useState(null);
  const [topicStats, setTopicStats]     = useState([]);
  const [subjectStats, setSubjectStats] = useState([]);
  const [trend, setTrend]               = useState([]);
  const [weekVol, setWeekVol]           = useState([]);
  const [errorDist, setErrorDist]       = useState([]);
  const [confMatrix, setConfMatrix]     = useState([]);
  const [diffStats, setDiffStats]       = useState([]);
  const [speedMatrix, setSpeedMatrix]   = useState([]);
  const [streakData, setStreakData]     = useState(null);
  const [heatmap, setHeatmap]           = useState([]);
  const [coverage, setCoverage]         = useState(null);
  const [prediction, setPrediction]     = useState(null);
  const [masteryScores, setMasteryScores] = useState([]);
  const [mockAttempts, setMockAttempts] = useState([]);
  const [mockStats, setMockStats] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await fetchAnalytics();
        const mockRows = await fetchMockAttemptSummaries(10);
        const { topicStats: ts, subjectStats: ss } = analyzeAttempts(data);
        setAttempts(data);
        setMetrics(computeOverallMetrics(data));
        setTopicStats(ts);
        setSubjectStats(ss);
        setTrend(buildSessionTrend(data));
        setWeekVol(buildWeeklyVolume(data));
        setErrorDist(buildErrorDistribution(data));
        setConfMatrix(buildConfidenceMatrix(data));
        setDiffStats(buildDifficultyStats(data));
        setSpeedMatrix(buildSpeedAccuracyMatrix(data));
        setStreakData(buildStreakData(data));
        setHeatmap(buildHourlyHeatmap(data));
        setCoverage(buildTopicCoverage(data));
        setPrediction(predictScore(data));
        setMasteryScores(buildSubjectMasteryScore(data));
        setMockAttempts(mockRows || []);
        setMockStats(buildMockStats(mockRows || []));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-cet-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-cet-accent border-t-transparent rounded-full animate-spin"/>
        <span className="text-cet-dim font-mono text-sm">Crunching your data…</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-cet-bg flex items-center justify-center">
      <div className="text-center">
        <div className="text-cet-red font-mono text-sm mb-2">⚠ {error}</div>
        <button onClick={() => navigate('/')} className="text-cet-dim font-mono text-xs hover:text-cet-text">← Home</button>
      </div>
    </div>
  );

  const strongest = findStrongestTopic(topicStats);
  const weakest   = findWeakestTopic(topicStats);
  const slowest   = findSlowestTopic(topicStats);
  const isEmpty   = !metrics || metrics.totalAttempts === 0;

  return (
    <div className="min-h-screen bg-cet-bg font-body pb-12">
      <AppHeader title="Analytics" subtitle="Your complete performance breakdown" />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ── KPI Row ── */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <KPICard label="Attempts"    value={metrics.totalAttempts} />
            <KPICard label="Accuracy"    value={`${metrics.accuracy}%`}   color={accuracyColor(metrics.accuracy)} />
            <KPICard label="Avg Time"    value={`${metrics.avgTime}s`}     color="text-cet-blue" />
            <KPICard label="Speed Ratio" value={metrics.avgSpeedRatio}     color="text-cet-yellow" sub="1.0 = on track" />
            <KPICard label="Guess Rate"  value={`${metrics.guessRate}%`}   color="text-cet-red" />
            <KPICard label="Confidence"  value={`${metrics.avgConfidence}/5`} color="text-cet-green" />
            {streakData && (
              <KPICard label="Streak 🔥"
                value={streakData.currentStreak}
                color="text-cet-accent"
                sub={`Best: ${streakData.bestStreak}`} />
            )}
          </div>
        )}

        {isEmpty && (
          <div className="text-center py-16 text-cet-dim font-mono text-sm">
            <div className="text-4xl mb-4">📊</div>
            <div>No attempts yet.</div>
            <div className="text-xs mt-1">Start practicing to see your analytics.</div>
            <button onClick={() => navigate('/')}
              className="mt-4 px-4 py-2 bg-cet-accent text-black rounded font-mono text-sm">
              Start Practicing
            </button>
          </div>
        )}

        {!isEmpty && (
          <>
            <div className="flex justify-end">
              <button
                onClick={() => navigate('/formula-analytics')}
                className="text-xs font-mono px-3 py-1.5 rounded-lg border border-cet-border text-cet-dim hover:text-cet-text hover:border-cet-accent/40">
                Formula Analytics →
              </button>
            </div>

            {/* ── Predicted CET Score ── */}
            {prediction && (
              <div className="bg-gradient-to-r from-cet-accent/10 to-cet-blue/10 border border-cet-accent/30 rounded-xl p-5">
                <div className="font-mono text-xs text-cet-dim uppercase tracking-widest mb-3">
                  Predicted CET Score (based on last 50 attempts)
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div>
                    <div className={`font-display text-5xl font-extrabold
                      ${prediction.label==='Excellent'?'text-cet-green':prediction.label==='Good'?'text-cet-accent':prediction.label==='Average'?'text-cet-yellow':'text-cet-red'}`}>
                      {prediction.predicted}
                    </div>
                    <div className="text-cet-dim font-mono text-xs mt-1">out of 200 marks</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs font-mono text-cet-dim mb-1">
                      <span>Range: {prediction.low}–{prediction.high}</span>
                      <span className={`px-2 py-0.5 rounded font-bold
                        ${prediction.label==='Excellent'?'bg-cet-green/20 text-cet-green':
                          prediction.label==='Good'?'bg-cet-accent/20 text-cet-accent':
                          prediction.label==='Average'?'bg-cet-yellow/20 text-cet-yellow':
                          'bg-cet-red/20 text-cet-red'}`}>
                        {prediction.label}
                      </span>
                    </div>
                    <div className="w-full h-3 bg-cet-border rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cet-red via-cet-yellow to-cet-green rounded-full"
                        style={{ width: `${(prediction.predicted/200)*100}%` }}/>
                    </div>
                    <div className="flex justify-between text-xs font-mono text-cet-muted mt-1">
                      <span>0</span><span>50</span><span>100</span><span>150</span><span>200</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Mock Test Analytics ── */}
            {mockStats && (
              <Section title="Mock Test Analytics">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <KPICard label="Tests Taken" value={mockStats.tests} />
                  <KPICard label="Avg Score" value={mockStats.avgScore.toFixed(1)} color="text-cet-blue" />
                  <KPICard label="Avg Accuracy" value={`${mockStats.avgAccuracy.toFixed(1)}%`} color={accuracyColor(mockStats.avgAccuracy)} />
                  <KPICard label="Best Accuracy" value={`${mockStats.bestAccuracy.toFixed(1)}%`} color="text-cet-green" />
                </div>

                <div className="overflow-hidden rounded-lg border border-cet-border">
                  <div className="grid grid-cols-5 bg-cet-panel text-xs font-mono text-cet-dim px-3 py-2">
                    <span>Test</span><span className="text-right">Score</span><span className="text-right">Accuracy</span><span className="text-right">Duration</span><span className="text-right">Date</span>
                  </div>
                  {mockAttempts.map((m) => {
                    const acc = m.total_q ? ((m.score || 0) / m.total_q) * 100 : 0;
                    return (
                      <div key={m.id} className="grid grid-cols-5 px-3 py-2 text-sm items-center border-t border-cet-border">
                        <span className="font-mono text-xs text-cet-text truncate">{m.mock_tests?.name || 'Mock Test'}</span>
                        <span className="text-right font-mono text-xs text-cet-text">{m.score ?? 0}/{m.total_q ?? 0}</span>
                        <span className={`text-right font-mono text-xs ${accuracyColor(acc)}`}>{acc.toFixed(1)}%</span>
                        <span className="text-right font-mono text-xs text-cet-dim">{m.mock_tests?.duration_minutes ? `${m.mock_tests.duration_minutes}m` : '—'}</span>
                        <span className="text-right font-mono text-xs text-cet-dim">{fmtDate(m.start_time)}</span>
                      </div>
                    );
                  })}
                  {mockAttempts.length === 0 && (
                    <div className="px-3 py-4 text-xs font-mono text-cet-dim">No mock attempts yet. Complete a mock test to see analytics.</div>
                  )}
                </div>
              </Section>
            )}

            {/* ── Highlights Row ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon:'💪', label:'Strongest Topic', data:strongest, color:'border-cet-green/30 bg-cet-green/5' },
                { icon:'⚠',  label:'Weakest Topic',   data:weakest,   color:'border-cet-red/30 bg-cet-red/5' },
                { icon:'🐢', label:'Slowest Topic',   data:slowest,   color:'border-cet-yellow/30 bg-cet-yellow/5' },
              ].map(({ icon, label, data, color }) => (
                <div key={label} className={`rounded-xl border p-4 ${color}`}>
                  <div className="text-2xl mb-2">{icon}</div>
                  <div className="text-xs text-cet-dim font-mono mb-1">{label}</div>
                  {data ? (
                    <>
                      <div className="font-display font-bold text-cet-text text-sm">{data.topic}</div>
                      <div className="font-mono text-xs text-cet-dim mt-1">
                        {data.accuracy != null ? `${data.accuracy.toFixed(1)}% accuracy` : ''}
                        {data.avgTime  ? ` · ${data.avgTime.toFixed(0)}s avg` : ''}
                        {data.total    ? ` · ${data.total} attempts` : ''}
                      </div>
                    </>
                  ) : (
                    <div className="text-cet-dim text-sm font-mono">No data yet</div>
                  )}
                </div>
              ))}
            </div>

            {/* ── Weekly Volume + Accuracy Trend (side by side on desktop) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {weekVol.some(d => d.attempts > 0) && (
                <Section title="This Week — Daily Volume">
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={weekVol}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                      <XAxis dataKey="date" tick={{ fontSize:10, fill:'#94a3b8', fontFamily:'JetBrains Mono' }} />
                      <YAxis tick={{ fontSize:10, fill:'#94a3b8', fontFamily:'JetBrains Mono' }} allowDecimals={false} />
                      <Tooltip contentStyle={TT.contentStyle} cursor={TT.cursor} />
                      <Bar dataKey="attempts" fill="#3b82f6" radius={[4,4,0,0]} name="Attempts" />
                    </BarChart>
                  </ResponsiveContainer>
                </Section>
              )}

              {trend.length > 1 && (
                <Section title="Accuracy Trend (by Day)">
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                      <XAxis dataKey="date" tick={{ fontSize:10, fill:'#94a3b8', fontFamily:'JetBrains Mono' }} />
                      <YAxis domain={[0,100]} tick={{ fontSize:10, fill:'#94a3b8', fontFamily:'JetBrains Mono' }} unit="%" />
                      <Tooltip contentStyle={TT.contentStyle} />
                      <ReferenceLine y={70} stroke="#10b981" strokeDasharray="4 2" strokeOpacity={0.4} />
                      <Line type="monotone" dataKey="accuracy" stroke="#f59e0b" strokeWidth={2}
                        dot={{ fill:'#f59e0b', r:3 }} name="Accuracy %" />
                    </LineChart>
                  </ResponsiveContainer>
                </Section>
              )}
            </div>

            {/* ── Subject Accuracy ── */}
            {subjectStats.length > 0 && (
              <Section title="Subject Accuracy">
                <div className="space-y-3">
                  {subjectStats.sort((a,b) => b.accuracy - a.accuracy).map(s => (
                    <div key={s.subject} className="flex items-center gap-3">
                      <div className="w-32 text-xs font-mono text-cet-dim truncate shrink-0">{s.subject}</div>
                      <div className="flex-1 h-2.5 bg-cet-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width:`${s.accuracy}%`, backgroundColor: subjectColor(s.subject) }}/>
                      </div>
                      <div className="w-12 text-right font-mono text-xs shrink-0"
                        style={{ color: subjectColor(s.subject) }}>
                        {s.accuracy.toFixed(1)}%
                      </div>
                      <div className="w-14 text-right font-mono text-xs text-cet-muted shrink-0">
                        {s.correct}/{s.total}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {masteryScores.length > 0 && (
              <Section title="Subject Mastery Score">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {masteryScores.map((s) => (
                    <div key={s.subject} className="p-4 rounded-lg bg-cet-bg border border-cet-border">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-display font-bold text-cet-text">{s.subject}</div>
                        <span className={`text-xs font-mono px-2 py-0.5 rounded ${s.readiness >= 80 ? 'bg-cet-green/15 text-cet-green' : s.readiness >= 60 ? 'bg-cet-yellow/15 text-cet-yellow' : 'bg-cet-red/15 text-cet-red'}`}>
                          {s.readiness}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-cet-border rounded-full overflow-hidden mb-2">
                        <div className="h-full rounded-full" style={{ width: `${s.readiness}%`, backgroundColor: subjectColor(s.subject) }} />
                      </div>
                      <div className="text-xs font-mono text-cet-dim">{s.total} attempts · avg {s.avgTime}s</div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── Speed vs Accuracy scatter ── */}
            {speedMatrix.length > 1 && (
              <Section title="Speed vs Accuracy (per topic — bubble size = attempts)">
                <div className="text-xs text-cet-muted font-mono mb-3">
                  Top-left = fast & accurate (ideal) · Bottom-right = slow & wrong (needs work)
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                    <XAxis
                      dataKey="avgSpeedRatio" name="Speed Ratio" type="number"
                      domain={[0, 2.5]} tick={{ fontSize:10, fill:'#94a3b8', fontFamily:'JetBrains Mono' }}
                      label={{ value:'Speed Ratio (1.0 = on time)', position:'insideBottom', offset:-4, fill:'#94a3b8', fontSize:10 }}
                    />
                    <YAxis
                      dataKey="accuracy" name="Accuracy" type="number"
                      domain={[0,100]} tick={{ fontSize:10, fill:'#94a3b8', fontFamily:'JetBrains Mono' }} unit="%"
                    />
                    <ZAxis dataKey="total" range={[40, 200]} name="Attempts" />
                    <Tooltip
                      contentStyle={TT.contentStyle}
                      cursor={{ strokeDasharray:'3 3' }}
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0]?.payload;
                        return (
                          <div style={TT.contentStyle} className="p-2 text-xs">
                            <div className="font-bold text-cet-text mb-1">{d.topic}</div>
                            <div>Accuracy: {d.accuracy}%</div>
                            <div>Speed ratio: {d.avgSpeedRatio}</div>
                            <div>Attempts: {d.total}</div>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine x={1.0} stroke="#f59e0b" strokeDasharray="4 2" strokeOpacity={0.5} />
                    <ReferenceLine y={70}  stroke="#10b981" strokeDasharray="4 2" strokeOpacity={0.5} />
                    <Scatter data={speedMatrix} name="Topics">
                      {speedMatrix.map((entry, i) => (
                        <Cell key={i} fill={subjectColor(entry.subject)} fillOpacity={0.8} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </Section>
            )}

            {/* ── Difficulty & Confidence ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {diffStats.length > 0 && (
                <Section title="Accuracy by Difficulty">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={diffStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                      <XAxis dataKey="difficulty" tick={{ fontSize:10, fill:'#94a3b8', fontFamily:'JetBrains Mono' }} />
                      <YAxis domain={[0,100]} tick={{ fontSize:10, fill:'#94a3b8', fontFamily:'JetBrains Mono' }} unit="%" />
                      <Tooltip contentStyle={TT.contentStyle} cursor={TT.cursor} />
                      <Bar dataKey="accuracy" radius={[4,4,0,0]} name="Accuracy %">
                        {diffStats.map((d,i) => (
                          <Cell key={i}
                            fill={d.difficulty==='Easy'?'#10b981':d.difficulty==='Hard'?'#ef4444':'#f59e0b'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Section>
              )}

              {confMatrix.some(c => c.total > 0) && (
                <Section title="Confidence vs Correctness">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={confMatrix}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                      <XAxis dataKey="level" tick={{ fontSize:10, fill:'#94a3b8', fontFamily:'JetBrains Mono' }}
                        label={{ value:'Confidence level', position:'insideBottom', offset:-2, fill:'#94a3b8', fontSize:10 }} />
                      <YAxis tick={{ fontSize:10, fill:'#94a3b8', fontFamily:'JetBrains Mono' }} />
                      <Tooltip contentStyle={TT.contentStyle} cursor={TT.cursor} />
                      <Legend wrapperStyle={{ fontSize:10, fontFamily:'JetBrains Mono' }} />
                      <Bar dataKey="correct" stackId="a" fill="#10b981" name="Correct" />
                      <Bar dataKey="wrong"   stackId="a" fill="#ef4444" name="Wrong" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Section>
              )}
            </div>

            {/* ── Hourly Heatmap ── */}
            {heatmap.some(h => h.attempts > 0) && (
              <Section title="When Do You Study? (hourly activity)">
                <div className="grid grid-cols-12 gap-1 mb-2">
                  {heatmap.map(h => {
                    const intensity = Math.min(1, h.attempts / (Math.max(...heatmap.map(x=>x.attempts)) || 1));
                    const bg = h.attempts === 0
                      ? 'bg-cet-border'
                      : h.accuracy >= 70 ? 'bg-cet-green' : h.accuracy >= 50 ? 'bg-cet-yellow' : 'bg-cet-red';
                    return (
                      <div key={h.hour} title={`${h.hour}:00 — ${h.attempts} attempts, ${h.accuracy}% acc`}
                        className={`h-8 rounded ${bg} transition-all cursor-default`}
                        style={{ opacity: h.attempts === 0 ? 0.2 : 0.3 + intensity * 0.7 }}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs font-mono text-cet-muted">
                  <span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span>
                </div>
                <div className="flex gap-3 mt-2 text-xs font-mono text-cet-dim">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-cet-green inline-block"/>≥70%</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-cet-yellow inline-block"/>50–70%</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-cet-red inline-block"/>&lt;50%</span>
                </div>
              </Section>
            )}

            {/* ── Topic Coverage ── */}
            {coverage && (
              <Section title={`Topic Coverage — ${coverage.done}/${coverage.total} topics attempted (${coverage.pct}%)`}>
                <div className="w-full h-3 bg-cet-border rounded-full overflow-hidden mb-4">
                  <div className="h-full bg-cet-accent rounded-full transition-all duration-700"
                    style={{ width:`${coverage.pct}%` }}/>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {coverage.bySubject.map(s => (
                    <div key={s.subject} className="flex items-center gap-2">
                      <div className="w-24 text-xs font-mono text-cet-dim truncate shrink-0">{s.subject}</div>
                      <div className="flex-1 h-2 bg-cet-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width:`${s.pct}%`, backgroundColor: subjectColor(s.subject) }}/>
                      </div>
                      <div className="text-xs font-mono text-cet-dim w-12 text-right shrink-0">
                        {s.done}/{s.total}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── Error Distribution ── */}
            {errorDist.length > 0 && (
              <Section title="Error Type Distribution (wrong answers only)">
                <div className="flex flex-wrap gap-3">
                  {errorDist.sort((a,b)=>b.count-a.count).map((e,i) => {
                    const total = errorDist.reduce((s,x)=>s+x.count, 0);
                    const pct   = Math.round((e.count/total)*100);
                    return (
                      <div key={e.type}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cet-bg border border-cet-border">
                        <div className="w-3 h-3 rounded-sm shrink-0"
                          style={{ backgroundColor: CHART_COLORS[i%CHART_COLORS.length] }}/>
                        <span className="font-mono text-xs text-cet-text capitalize">{e.type}</span>
                        <span className="font-mono text-xs text-cet-dim">{e.count} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* ── Topic Table ── */}
            {topicStats.length > 0 && (
              <Section title="Full Topic Breakdown">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-cet-border">
                        {['Topic','Subject','Attempts','Correct','Accuracy','Avg Time','Status'].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-cet-dim font-normal whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...topicStats].sort((a,b) => a.accuracy - b.accuracy).map(t => (
                        <tr key={t.topic}
                          className="border-b border-cet-border/50 hover:bg-cet-border/20 transition-colors">
                          <td className="px-3 py-2.5 text-cet-text">{t.topic}</td>
                          <td className="px-3 py-2.5 text-cet-dim whitespace-nowrap">{t.subject}</td>
                          <td className="px-3 py-2.5 text-cet-dim">{t.total}</td>
                          <td className="px-3 py-2.5 text-cet-green">{t.correct}</td>
                          <td className={`px-3 py-2.5 font-bold ${accuracyColor(t.accuracy)}`}>
                            {t.accuracy.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2.5 text-cet-dim">{t.avgTime.toFixed(0)}s</td>
                          <td className="px-3 py-2.5">
                            <span className={`px-2 py-0.5 rounded text-xs
                              ${t.accuracy < 60
                                ? 'bg-cet-red/20 text-cet-red'
                                : t.accuracy < 80
                                  ? 'bg-cet-yellow/20 text-cet-yellow'
                                  : 'bg-cet-green/20 text-cet-green'}`}>
                              {t.accuracy < 60 ? 'Weak' : t.accuracy < 80 ? 'Improving' : 'Strong'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </>
        )}

        {/* ── Question Bank — always visible ── */}
        <Section title="Question Bank (300 Real PYQs)">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { year:'2023', count:100, color:'#3b82f6' },
              { year:'2024', count:100, color:'#a855f7' },
              { year:'2025', count:100, color:'#10b981' },
            ].map(({ year, count, color }) => (
              <div key={year} className="rounded-lg p-3 border border-cet-border bg-cet-bg text-center">
                <div className="font-mono font-bold text-lg" style={{ color }}>{count}</div>
                <div className="text-xs text-cet-dim font-mono">CET {year}</div>
              </div>
            ))}
            {[
              { label:'Mathematics',       count:109 },
              { label:'Computer Concepts', count:65  },
              { label:'Logical Reasoning', count:63  },
              { label:'English',           count:56  },
              { label:'General Aptitude',  count:7   },
            ].map(({ label, count }) => (
              <div key={label} className="rounded-lg p-3 border border-cet-border bg-cet-bg">
                <div className="font-mono font-bold text-cet-accent text-sm">{count}</div>
                <div className="text-xs text-cet-dim font-mono truncate">{label}</div>
              </div>
            ))}
          </div>
        </Section>

      </main>
    </div>
  );
}

function buildMockStats(rows) {
  if (!rows.length) return null;
  const count = rows.length;
  const sumAcc = rows.reduce((s, r) => s + (r.total_q ? (r.score || 0) / r.total_q : 0), 0);
  const bestAcc = Math.max(...rows.map(r => (r.total_q ? ((r.score || 0) / r.total_q) * 100 : 0)));
  const avgAcc = count ? (sumAcc / count) * 100 : 0;
  const avgScore = count ? rows.reduce((s, r) => s + (r.score || 0), 0) / count : 0;
  return {
    tests: count,
    avgAccuracy: avgAcc,
    bestAccuracy: bestAcc,
    avgScore,
  };
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
