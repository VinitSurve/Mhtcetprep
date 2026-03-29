import { difficultyClass, subjectAcronym, subjectColor, isAnswerCorrect } from '../utils/helpers';

/**
 * QuestionCard
 * Props:
 *  - question: question object from DB
 *  - selectedAnswer: string | null
 *  - onSelect: (answer) => void
 *  - revealed: boolean (show correct/wrong colors)
 *  - markedForReview: boolean
 *  - onMark: () => void
 *  - questionNumber: int
 *  - totalQuestions: int
 */
export default function QuestionCard({
  question,
  selectedAnswer,
  onSelect,
  revealed = false,
  markedForReview = false,
  onMark,
  questionNumber,
  totalQuestions,
}) {
  if (!question) return null;

  const opts = question.options || {};
  const keys = Object.keys(opts);
  const is2023OddFigureQuestion =
    question.subject === 'Logical Reasoning' &&
    question.topic === 'Odd One Out' &&
    (question.question_subtype || '').toLowerCase().includes('figure') &&
    (question.question || '').trim().toLowerCase() === 'select the odd figure from the given alternatives.';
  const questionImageSrc = question.image_url || (is2023OddFigureQuestion ? '/image.png' : null);

  const getOptionClass = (key) => {
    const base = 'w-full text-left px-4 py-3 rounded-lg border text-sm font-body transition-all duration-200 ';
    if (!revealed) {
      if (selectedAnswer === key)
        return base + 'border-cet-accent bg-cet-accent/10 text-cet-text';
      return base + 'border-cet-border bg-cet-panel hover:border-cet-accent/50 hover:bg-cet-accent/5 text-cet-text cursor-pointer';
    }
    // Revealed state
    const correct = isAnswerCorrect(question, key);
    if (correct)
      return base + 'border-cet-green bg-cet-green/10 text-cet-green';
    if (key === selectedAnswer && !correct)
      return base + 'border-cet-red bg-cet-red/10 text-cet-red';
    return base + 'border-cet-border bg-cet-panel text-cet-dim opacity-50';
  };

  return (
    <div className="animate-slide-up">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {questionNumber && (
            <span className="font-mono text-xs text-cet-dim">
              Q{questionNumber}{totalQuestions ? `/${totalQuestions}` : ''}
            </span>
          )}
          {/* Subject badge */}
          <span
            className="text-xs px-2 py-0.5 rounded font-mono font-bold"
            style={{
              backgroundColor: `${subjectColor(question.subject)}20`,
              color: subjectColor(question.subject),
            }}>
            {subjectAcronym(question.subject)}
          </span>
          {/* Difficulty badge */}
          <span className={`text-xs px-2 py-0.5 rounded border font-mono ${difficultyClass(question.difficulty)}`}>
            {question.difficulty}
          </span>
          {/* High-freq badge */}
          {question.is_repeated && (
            <span className="text-xs px-2 py-0.5 rounded bg-cet-yellow/10 text-cet-yellow border border-cet-yellow/20 font-mono">
              ★ PYQ
            </span>
          )}
        </div>

        {/* Mark for review */}
        {onMark && (
          <button
            onClick={onMark}
            className={`text-xs px-3 py-1.5 rounded border transition-all font-mono
              ${markedForReview
                ? 'border-cet-yellow bg-cet-yellow/10 text-cet-yellow'
                : 'border-cet-border text-cet-dim hover:border-cet-yellow hover:text-cet-yellow'}`}>
            {markedForReview ? '★ Marked' : '☆ Mark'}
          </button>
        )}
      </div>

      {/* Topic chip */}
      <div className="text-xs text-cet-dim font-mono mb-4">
        {question.subject} › {question.topic}
        {question.question_subtype && <> › {question.question_subtype}</>}
        <span className="ml-2 text-cet-muted">⏱ ~{question.expected_time_sec}s</span>
      </div>

      {/* Question text */}
      <div className="text-cet-text text-base leading-relaxed mb-6 font-body">
        {question.question}
      </div>

      {questionImageSrc && (
        <div className="mb-6">
          <img
            src={questionImageSrc}
            alt="Question figure"
            className="w-full max-h-72 object-contain rounded-lg border border-cet-border bg-cet-bg"
            loading="lazy"
          />
        </div>
      )}

      {/* Options */}
      <div className="space-y-2">
        {keys.map(key => (
          <button
            key={key}
            className={getOptionClass(key)}
            onClick={() => !revealed && onSelect?.(key)}
            disabled={revealed}>
            <span className="font-mono font-bold text-cet-dim mr-3">{key}.</span>
            {opts[key]}
          </button>
        ))}
      </div>

      {/* Explanation (revealed) */}
      {revealed && question.explanation && (
        <div className="mt-4 p-4 rounded-lg bg-cet-blue/5 border border-cet-blue/20 animate-fade-in">
          <div className="text-xs text-cet-blue font-mono mb-1">EXPLANATION</div>
          <div className="text-sm text-cet-text leading-relaxed">{question.explanation}</div>
        </div>
      )}
    </div>
  );
}
