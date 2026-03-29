/**
 * QuestionPalette
 * States: current (blue), answered (green), marked (yellow), visited (orange), untouched (border).
 */
export default function QuestionPalette({ questions, currentIndex, answers, marked, visited, onJump }) {
  const answeredCount = answers ? answers.size : 0;
  const markedCount = marked ? marked.size : 0;
  const visitedCount = visited ? visited.size : 0;

  const stateClass = (qId, isCurrent) => {
    if (isCurrent) return 'bg-cet-blue text-white border-cet-blue';
    if (marked?.has(qId) && answers?.has(qId)) return 'bg-cet-yellow/20 border-cet-yellow text-cet-yellow';
    if (marked?.has(qId)) return 'border-cet-yellow text-cet-yellow';
    if (answers?.has(qId)) return 'bg-cet-green/20 border-cet-green text-cet-green';
    if (visited?.has(qId)) return 'border-cet-orange text-cet-orange';
    return 'border-cet-border text-cet-dim';
  };

  return (
    <div className="bg-cet-panel border border-cet-border rounded-xl p-4 space-y-4">
      <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
        <Chip label="Answered" value={answeredCount} className="bg-cet-green/10 border-cet-green/20 text-cet-green" />
        <Chip label="Marked"   value={markedCount}  className="bg-cet-yellow/10 border-cet-yellow/20 text-cet-yellow" />
        <Chip label="Visited"  value={visitedCount} className="bg-cet-orange/10 border-cet-orange/20 text-cet-orange" />
        <Chip label="Left"     value={(questions?.length || 0) - answeredCount} className="bg-cet-border/50 border-cet-border text-cet-dim" />
      </div>

      <div className="grid grid-cols-5 gap-1.5 max-h-64 overflow-y-auto pr-1">
        {questions.map((q, idx) => (
          <button
            key={q.id}
            onClick={() => onJump?.(idx)}
            className={`h-9 w-full rounded border font-mono text-xs font-bold transition-all ${stateClass(q.id, idx === currentIndex)}`}
          >
            {idx + 1}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-xs font-mono text-cet-dim">
        <Legend color="bg-cet-blue" label="Current" />
        <Legend color="bg-cet-green/60" label="Answered" />
        <Legend color="bg-cet-yellow/60" label="Marked" />
        <Legend color="bg-cet-orange/60" label="Visited" />
      </div>
    </div>
  );
}

function Chip({ label, value, className }) {
  return (
    <div className={`rounded-lg border p-2 ${className}`}>
      <div className="font-bold text-sm">{value}</div>
      <div className="text-[10px] text-cet-dim">{label}</div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`w-3 h-3 rounded-sm inline-block ${color}`} /> {label}
    </span>
  );
}
