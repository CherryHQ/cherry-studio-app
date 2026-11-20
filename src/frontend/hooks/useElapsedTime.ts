import { useEffect, useState } from 'react';

/** Tracks elapsed milliseconds since mount, ticking every `intervalMs` while `isActive` is true. */
export function useElapsedTime(isActive: boolean, intervalMs = 1000): number {
  const [startedAt] = useState(Date.now);
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, isActive]);

  return Math.max(0, now - startedAt);
}
