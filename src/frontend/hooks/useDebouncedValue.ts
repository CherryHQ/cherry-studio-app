import { useEffect, useState } from 'react';

/** Returns a value that settles `delayMs` after `value` stops changing. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);

  return delayMs <= 0 ? value : debounced;
}
