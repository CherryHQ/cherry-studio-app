import { useEffect, useState } from 'react';

/** Keeps an elapsed wall-clock duration live, then settles on the persisted final value. */
export function useElapsedTimerMs(
  isRunning: boolean,
  startedAt: number | undefined,
  finalMs: number | undefined,
  tickMs = 1000,
): number {
  const [displayMs, setDisplayMs] = useState(() => {
    if (isRunning) {
      return startedAt === undefined ? 0 : Math.max(0, Date.now() - startedAt);
    }
    return finalMs ?? 0;
  });

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const update = () => {
      setDisplayMs((previous) =>
        startedAt === undefined ? previous + tickMs : Math.max(0, Date.now() - startedAt),
      );
    };
    const resetTimeout = setTimeout(update, 0);
    const interval = setInterval(update, tickMs);

    return () => {
      clearTimeout(resetTimeout);
      clearInterval(interval);
    };
  }, [isRunning, startedAt, tickMs]);

  return isRunning ? displayMs : (finalMs ?? 0);
}
