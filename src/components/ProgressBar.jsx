export default function ProgressBar({ current, total, label, color = 'bg-cet-accent' }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs text-cet-dim mb-1 font-mono">
          <span>{label}</span>
          <span>{current}/{total} ({pct}%)</span>
        </div>
      )}
      <div className="w-full h-2 bg-cet-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
