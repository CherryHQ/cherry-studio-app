import { useElapsedTimerMs } from './useElapsedTimerMs';

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
  return useElapsedTimerMs(isThinking, startedAt, finalMs, 100);
}
