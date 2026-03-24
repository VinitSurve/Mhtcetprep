import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { fetchRecentSessions } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';
import { formatDate, formatTimeHuman } from '../utils/helpers';

const MODES = [
  { id:'practice', title:'Practice Mode',   subtitle:'One question at a time. Build fundamentals.', icon:'📖', path:'/practice',             accent:'#3b82f6', tag:'Confidence Builder' },
  { id:'exam',     title:'Exam Mode',        subtitle:'100 questions · 90 minutes · Full simulation',  icon:'🎯', path:'/exam',                accent:'#ef4444', tag:'Full Test'          },
  { id:'speed',    title:'Speed Mode',       subtitle:'10 questions · 30s each · Beat the clock',      icon:'⚡', path:'/speed',               accent:'#f59e0b', tag:'Speed Drill'        },
  { id:'adaptive', title:'Adaptive Mode',    subtitle:'Auto-targets your weak topics from past attempts',icon:'🧠',path:'/practice?mode=adaptive',accent:'#a855f7', tag:'Rank Boost'       },
  { id:'mistakes', title:'Mistake Bank',     subtitle:'Reattempt questions you got wrong',              icon:'🔁', path:'/mistakes',             accent:'#10b981', tag:'Error Fix'          },
  { id:'highfreq', title:'PYQ Mode',         subtitle:'Real questions from 2023 · 2024 · 2025 papers', icon:'🔥', path:'/highfreq',             accent:'#f97316', tag:'300 PYQs'           },
  { id:'formula',  title:'Formula → Application', subtitle:'Learn concept, apply formula, solve targeted drills', icon:'📐', path:'/formula', accent:'#3b82f6', tag:'Concept to Solve' },
  { id:'mastery',  title:'Subject Mastery',  subtitle:'50-question focused session with weak-topic bias', icon:'📚', path:'/mastery', accent:'#a855f7', tag:'Exam Ready' },
  { id:'revision', title:'Smart Revision',   subtitle:'Daily set from wrong, slow, and low-confidence questions', icon:'🧩', path:'/revision', accent:'#14b8a6', tag:'Daily 10-20' },
];

export default function Home() {
  const navigate = useNavigate();
  const { displayName } = useAuth();
  const [sessions, setSessions] = useState([]);

  useEffect(() => { fetchRecentSessions(5).then(setSessions).catch(() => {}); }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-screen bg-cet-bg font-body">
      <AppHeader />

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Hero */}
        <div className="mb-10">
          <div className="inline-block text-xs font-mono px-3 py-1 rounded bg-cet-accent/10 text-cet-accent border border-cet-accent/20 mb-3">
            ADAPTIVE LEARNING ENGINE v1.0
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-cet-text leading-tight">
            {greeting}, {displayName}.<br />
            <span className="text-cet-accent">Rank higher.</span>
          </h2>
          <p className="mt-2 text-cet-dim text-sm max-w-md">
            A data-driven system that identifies your weak spots and targets them automatically.
          </p>
        </div>

        {/* Mode Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {MODES.map((mode, i) => (
            <button key={mode.id} onClick={() => navigate(mode.path)}
              className="group text-left rounded-xl border border-cet-border bg-cet-panel p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{mode.icon}</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{ backgroundColor:`${mode.accent}20`, color:mode.accent }}>
                  {mode.tag}
                </span>
              </div>
              <div className="font-display font-bold text-cet-text mb-1 group-hover:text-white">{mode.title}</div>
              <div className="text-xs text-cet-dim leading-relaxed">{mode.subtitle}</div>
              <div className="mt-4 h-0.5 rounded-full w-0 group-hover:w-full transition-all duration-300"
                style={{ backgroundColor: mode.accent }}/>
            </button>
          ))}
        </div>

        {/* Recent Sessions */}
        {sessions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-mono text-xs text-cet-dim uppercase tracking-widest">Recent Sessions</h3>
              <button onClick={() => navigate('/analytics')} className="text-xs text-cet-accent font-mono hover:underline">View All →</button>
            </div>
            <div className="space-y-2">
              {sessions.map(s => {
                const acc = s.total_questions > 0 ? Math.round((s.correct_answers/s.total_questions)*100) : 0;
                return (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-cet-panel border border-cet-border text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-cet-border text-cet-dim uppercase">{s.mode}</span>
                      <span className="text-cet-dim text-xs">{formatDate(s.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-4 font-mono text-xs">
                      <span className="text-cet-dim">{s.correct_answers}/{s.total_questions}</span>
                      <span className={acc>=70?'text-cet-green':acc>=50?'text-cet-yellow':'text-cet-red'}>{acc}%</span>
                      <span className="text-cet-dim">{formatTimeHuman(s.total_time)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
