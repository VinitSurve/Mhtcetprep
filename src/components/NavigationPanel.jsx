/**
 * NavigationPanel for Exam Mode
 * Props:
 *  - total: number
 *  - answers: { [index]: string }  — answered questions
 *  - marked: Set<number>           — marked for review
 *  - current: number               — current index
 *  - onJump: (index) => void
 */
export default function NavigationPanel({ total, answers, marked, current, onJump }) {
  const answered = Object.keys(answers).length;
  const markedCount = marked.size;

  const getBtnClass = (i) => {
    const isMarked   = marked.has(i);
    const isAnswered = answers[i] != null;
    const isCurrent  = i === current;

    if (isCurrent)   return 'bg-cet-blue border-cet-blue text-white';
    if (isMarked)    return 'bg-cet-yellow/20 border-cet-yellow text-cet-yellow';
    if (isAnswered)  return 'bg-cet-green/20 border-cet-green/50 text-cet-green';
    return 'border-cet-border text-cet-dim hover:border-cet-accent/40';
  };

  return (
    <div className="bg-cet-panel border border-cet-border rounded-xl p-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div className="rounded-lg bg-cet-green/10 border border-cet-green/20 p-2">
          <div className="font-mono text-lg font-bold text-cet-green">{answered}</div>
          <div className="text-xs text-cet-dim font-mono">Answered</div>
        </div>
        <div className="rounded-lg bg-cet-yellow/10 border border-cet-yellow/20 p-2">
          <div className="font-mono text-lg font-bold text-cet-yellow">{markedCount}</div>
          <div className="text-xs text-cet-dim font-mono">Marked</div>
        </div>
        <div className="rounded-lg bg-cet-border/50 border border-cet-border p-2">
          <div className="font-mono text-lg font-bold text-cet-dim">{total - answered}</div>
          <div className="text-xs text-cet-dim font-mono">Skipped</div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-5 gap-1.5 max-h-60 overflow-y-auto pr-1">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            onClick={() => onJump(i)}
            className={`h-9 w-full rounded border font-mono text-xs font-bold transition-all ${getBtnClass(i)}`}>
            {i + 1}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 text-xs font-mono text-cet-dim">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-cet-blue inline-block"/> Current
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-cet-green/30 inline-block"/> Answered
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-cet-yellow/30 inline-block"/> Marked
        </span>
      </div>
    </div>
  );
}
