export default function FormulaCard({ formula, concept, topic, subject, onStart }) {
  return (
    <div className="bg-cet-blue/10 border border-cet-blue/30 rounded-xl p-5 animate-slide-up">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-xs font-mono text-cet-blue uppercase tracking-widest">Formula to Application</div>
        <span className="text-xs font-mono px-2 py-0.5 rounded border border-cet-border text-cet-dim">
          {subject} · {topic}
        </span>
      </div>
      <div className="text-cet-accent font-display text-lg font-bold mb-2">{concept || 'Concept'}</div>
      <div className="bg-cet-bg border border-cet-border rounded-lg px-4 py-3 font-mono text-sm text-cet-text mb-4 break-words">
        {formula}
      </div>
      {onStart && (
        <button
          onClick={onStart}
          className="px-4 py-2 rounded-lg bg-cet-accent text-black text-sm font-display font-bold hover:bg-amber-400 transition-all">
          Start Practice
        </button>
      )}
    </div>
  );
}
