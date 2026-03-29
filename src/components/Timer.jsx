import { useState, useEffect, useRef } from 'react';
import { formatTime } from '../utils/helpers';

/**
 * Timer component
 * Props:
 *  - mode: 'countdown' | 'countup'
 *  - initialSeconds: number
 *  - onTick: (elapsed) => void
 *  - onExpire: () => void  (countdown only)
 *  - running: boolean
 *  - reset: any (change to reset)
 */
export default function Timer({ mode = 'countup', initialSeconds = 0, onTick, onExpire, running = true, reset }) {
  const [seconds, setSeconds] = useState(mode === 'countdown' ? initialSeconds : 0);
  const intervalRef = useRef(null);
  const expireFiredRef = useRef(false);

  useEffect(() => {
    setSeconds(mode === 'countdown' ? initialSeconds : 0);
    expireFiredRef.current = false;
  }, [reset, initialSeconds, mode]);

  useEffect(() => {
    if (!running) {
      clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setSeconds(prev => {
        if (mode === 'countdown') {
          const next = prev - 1;
          if (next <= 0) {
            clearInterval(intervalRef.current);
            return 0;
          }
          return next;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [running, mode, reset]);

  useEffect(() => {
    if (!running) return;
    if (mode === 'countdown') {
      const elapsed = Math.max(0, (initialSeconds || 0) - seconds);
      onTick?.(elapsed);
      if (seconds <= 0 && !expireFiredRef.current) {
        expireFiredRef.current = true;
        onExpire?.();
      }
    } else {
      onTick?.(seconds);
    }
  }, [seconds, running, mode, initialSeconds, onTick, onExpire]);

  const pct = mode === 'countdown' && initialSeconds > 0
    ? (seconds / initialSeconds) * 100 : null;

  const urgent = mode === 'countdown' && seconds <= 10;
  const warning = mode === 'countdown' && seconds <= 30;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`font-mono text-2xl font-bold tracking-widest transition-colors
        ${urgent  ? 'text-red-400 animate-pulse' :
          warning ? 'text-yellow-400' :
                    'text-cet-accent'}`}>
        {formatTime(seconds)}
      </div>
      {pct !== null && (
        <div className="w-full h-1 rounded-full bg-cet-border overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000
              ${urgent  ? 'bg-red-500' :
                warning ? 'bg-yellow-400' :
                          'bg-cet-accent'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
