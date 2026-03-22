import { useState } from 'react';

const ERROR_TYPES = [
  { value: 'concept',     label: 'Concept Gap',    icon: '📚' },
  { value: 'calculation', label: 'Calculation',    icon: '🧮' },
  { value: 'reading',     label: 'Misread',        icon: '👁' },
  { value: 'silly',       label: 'Silly Mistake',  icon: '🤦' },
  { value: 'timeout',     label: 'Ran Out of Time',icon: '⏱' },
];

/**
 * ConfidenceModal
 * Props:
 *  - isCorrect: boolean
 *  - onSubmit: ({ confidence, wasGuess, errorType }) => void
 */
export default function ConfidenceModal({ isCorrect, onSubmit }) {
  const [confidence, setConfidence] = useState(null);
  const [wasGuess, setWasGuess]     = useState(false);
  const [errorType, setErrorType]   = useState('');
  const [step, setStep]             = useState(1); // 1: confidence, 2: error type (if wrong)

  const canProceed = confidence !== null;

  const handleNext = () => {
    if (!isCorrect && step === 1) { setStep(2); return; }
    onSubmit({ confidence, wasGuess, errorType: isCorrect ? null : errorType });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 animate-fade-in">
      <div className="w-full max-w-md bg-cet-panel border border-cet-border rounded-t-2xl sm:rounded-2xl p-6 animate-slide-up">

        {/* Result banner */}
        <div className={`flex items-center gap-3 mb-5 p-3 rounded-lg border
          ${isCorrect
            ? 'bg-cet-green/10 border-cet-green/30'
            : 'bg-cet-red/10 border-cet-red/30'}`}>
          <span className="text-2xl">{isCorrect ? '✅' : '❌'}</span>
          <div>
            <div className={`font-display font-bold ${isCorrect ? 'text-cet-green' : 'text-cet-red'}`}>
              {isCorrect ? 'Correct!' : 'Incorrect'}
            </div>
            <div className="text-xs text-cet-dim">Answer your reflection below</div>
          </div>
        </div>

        {step === 1 && (
          <>
            {/* Confidence slider */}
            <div className="mb-5">
              <div className="text-sm font-mono text-cet-dim mb-3">
                HOW CONFIDENT WERE YOU? (1=Guessed, 5=Certain)
              </div>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n => (
                  <button
                    key={n}
                    onClick={() => setConfidence(n)}
                    className={`flex-1 py-3 rounded-lg border font-mono font-bold text-sm transition-all
                      ${confidence === n
                        ? 'border-cet-accent bg-cet-accent/10 text-cet-accent'
                        : 'border-cet-border text-cet-dim hover:border-cet-accent/40'}`}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-xs text-cet-muted mt-1 font-mono px-1">
                <span>Guessed</span><span>Certain</span>
              </div>
            </div>

            {/* Was guess */}
            <div className="mb-5">
              <div className="text-sm font-mono text-cet-dim mb-2">WAS THIS A GUESS?</div>
              <div className="flex gap-3">
                {[true, false].map(val => (
                  <button
                    key={String(val)}
                    onClick={() => setWasGuess(val)}
                    className={`flex-1 py-2.5 rounded-lg border font-mono text-sm transition-all
                      ${wasGuess === val
                        ? 'border-cet-accent bg-cet-accent/10 text-cet-accent'
                        : 'border-cet-border text-cet-dim hover:border-cet-accent/40'}`}>
                    {val ? 'Yes, guessed' : 'No, I knew'}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 2 && !isCorrect && (
          <div className="mb-5">
            <div className="text-sm font-mono text-cet-dim mb-3">WHY DID YOU GET IT WRONG?</div>
            <div className="grid grid-cols-2 gap-2">
              {ERROR_TYPES.map(e => (
                <button
                  key={e.value}
                  onClick={() => setErrorType(e.value)}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-all text-left
                    ${errorType === e.value
                      ? 'border-cet-red bg-cet-red/10 text-cet-red'
                      : 'border-cet-border text-cet-dim hover:border-cet-red/40'}`}>
                  <span>{e.icon}</span>
                  <span className="font-body">{e.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleNext}
          disabled={!canProceed}
          className={`w-full py-3 rounded-lg font-display font-bold text-sm transition-all
            ${canProceed
              ? 'bg-cet-accent text-black hover:bg-amber-400'
              : 'bg-cet-border text-cet-muted cursor-not-allowed'}`}>
          {!isCorrect && step === 1 ? 'Next →' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}
