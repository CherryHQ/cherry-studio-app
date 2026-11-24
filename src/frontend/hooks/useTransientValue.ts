import { useCallback, useEffect, useRef, useState } from 'react';

export interface TransientValue<T> {
  value: T | undefined;
  show(nextValue: T): void;
  clear(): void;
}

/**
 * Holds a temporary UI state (such as copied feedback or scroll highlight) that automatically
 * clears after `durationMs`, cancelling timers on reset or unmount.
 */
export function useTransientValue<T>(durationMs: number, resetKey?: unknown): TransientValue<T> {
  const [value, setValue] = useState<T | undefined>(undefined);
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  if (!Object.is(lastResetKey, resetKey)) {
    setLastResetKey(resetKey);
    setValue(undefined);
  }

  const clear = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
    setValue(undefined);
  }, []);

  const show = useCallback(
    (nextValue: T) => {
      clearTimeout(timerRef.current);
      setValue(nextValue);
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        setValue(undefined);
      }, durationMs);
    },
    [durationMs],
  );

  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    },
    [resetKey],
  );

  return { value, show, clear };
}
