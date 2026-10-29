import { useState } from 'react';

/** Reanimated's jest build needs native Worklets; the composer session only reads and writes a cell. */
export function useSharedValue<T>(initial: T) {
  const [cell] = useState(() => ({
    value: initial,
    get() {
      return this.value;
    },
    set(next: T) {
      this.value = next;
    },
  }));
  return cell;
}
