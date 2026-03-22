// ──────────────────────────────────────────────
// General Utilities
// ──────────────────────────────────────────────

/** Format seconds to MM:SS string */
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/** Format seconds to human-readable string */
export function formatTimeHuman(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** Format date to readable string */
export function formatDate(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/** Round to N decimal places */
export function round(val, n = 1) {
  return parseFloat(val.toFixed(n));
}

/** Accuracy color class (Tailwind) */
export function accuracyColor(accuracy) {
  if (accuracy >= 80) return 'text-cet-green';
  if (accuracy >= 60) return 'text-cet-yellow';
  return 'text-cet-red';
}

/** Speed ratio label */
export function speedLabel(ratio) {
  if (ratio == null) return '—';
  if (ratio <= 0.7) return 'Fast ⚡';
  if (ratio <= 1.2) return 'On Track ✓';
  return 'Slow ⏳';
}

/** Speed ratio color class */
export function speedColor(ratio) {
  if (ratio == null) return 'text-cet-dim';
  if (ratio <= 0.7) return 'text-cet-green';
  if (ratio <= 1.2) return 'text-cet-yellow';
  return 'text-cet-red';
}

/** Generate a session UUID (browser-safe) */
export function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

/** Difficulty badge color */
export function difficultyClass(d) {
  if (d === 'Easy')   return 'bg-cet-green/20 text-cet-green border-cet-green/30';
  if (d === 'Hard')   return 'bg-cet-red/20 text-cet-red border-cet-red/30';
  return 'bg-cet-yellow/20 text-cet-yellow border-cet-yellow/30';
}

/** Clamp a value between min and max */
export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/** Convert subject name to short acronym for badges */
export function subjectAcronym(subject) {
  const map = {
    'Mathematics': 'MATH',
    'Logical Reasoning': 'LR',
    'Computer Concepts': 'CS',
    'English': 'ENG',
    'General Aptitude': 'APT',
  };
  return map[subject] || subject.slice(0, 3).toUpperCase();
}

/** Subject color accent */
export function subjectColor(subject) {
  const map = {
    'Mathematics':       '#3b82f6',
    'Logical Reasoning': '#a855f7',
    'Computer Concepts': '#10b981',
    'English':           '#f59e0b',
    'General Aptitude':  '#ef4444',
  };
  return map[subject] || '#94a3b8';
}
