import { useEffect, useRef, useState } from 'react';

/**
 * Ticks a live "how long has the model been thinking" duration while
 * `isThinking` is true, then settles on `finalMs` once it flips to false.
 * Prefers wall-clock math from `startedAt` when available so the displayed
 * time survives re-mounts; otherwise falls back to a local 100ms counter.
 */
export function useThinkingTimerMs(
  isThinking: boolean,
  startedAt: number | undefined,
  finalMs: number | undefined,
): number {
  const [displayMs, setDisplayMs] = useState(() => {
    if (isThinking) {
      return startedAt !== undefined ? Math.max(0, Date.now() - startedAt) : 0;
    }
    return finalMs ?? 0;
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isThinking) {
      setDisplayMs(finalMs ?? 0);
      return;
    }

    setDisplayMs(startedAt !== undefined ? Math.max(0, Date.now() - startedAt) : 0);
    intervalRef.current = setInterval(() => {
      setDisplayMs((previous) =>
        startedAt !== undefined ? Math.max(0, Date.now() - startedAt) : previous + 100,
      );
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isThinking, startedAt, finalMs]);

  return displayMs;
}
