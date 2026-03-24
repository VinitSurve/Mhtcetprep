const reasonLabel = {
  wrong: 'You got this wrong',
  slow: 'You were too slow',
  low_confidence: 'You were not confident',
};

export default function RevisionCard({ question, reasons = [], selected, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-xl border transition-all ${
        selected
          ? 'border-cet-accent bg-cet-accent/10'
          : 'border-cet-border bg-cet-panel hover:border-cet-accent/40'
      }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-mono text-cet-dim">{question.subject} · {question.topic}</div>
        {selected && <span className="text-cet-accent font-mono text-xs">SELECTED</span>}
      </div>
      <div className="text-sm text-cet-text line-clamp-2 mb-3">{question.question}</div>
      <div className="flex flex-wrap gap-1.5">
        {reasons.map((r) => (
          <span
            key={r}
            className={`text-xs font-mono px-2 py-0.5 rounded border ${
              r === 'wrong'
                ? 'border-cet-red/40 text-cet-red bg-cet-red/10'
                : r === 'slow'
                ? 'border-cet-yellow/40 text-cet-yellow bg-cet-yellow/10'
                : 'border-cet-blue/40 text-cet-blue bg-cet-blue/10'
            }`}>
            {reasonLabel[r] || r}
          </span>
        ))}
      </div>
    </button>
  );
}
