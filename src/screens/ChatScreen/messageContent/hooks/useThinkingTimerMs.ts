import { useEffect, useState } from 'react';

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
  useEffect(() => {
    if (!isThinking) {
      return;
    }

    const resetTimeout = setTimeout(() => {
      setDisplayMs(startedAt !== undefined ? Math.max(0, Date.now() - startedAt) : 0);
    }, 0);
    const interval = setInterval(() => {
      setDisplayMs((previous) =>
        startedAt !== undefined ? Math.max(0, Date.now() - startedAt) : previous + 100,
      );
    }, 100);

    return () => {
      clearTimeout(resetTimeout);
      clearInterval(interval);
    };
  }, [isThinking, startedAt]);

  return isThinking ? displayMs : (finalMs ?? 0);
}
