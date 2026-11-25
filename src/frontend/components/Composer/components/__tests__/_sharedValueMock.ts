import { useEffect, useState } from 'react';

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback: (...args: unknown[]) => void, ...args: unknown[]) => callback(...args),
}));

const reactions = new Set<() => void>();

export function useSharedValue<T>(initial: T) {
  const [cell] = useState(() => ({
    value: initial,
    get() {
      return this.value;
    },
    set(next: T) {
      this.value = next;
      reactions.forEach((update) => update());
    },
  }));
  return cell;
}

export function useDerivedValue<T>(get: () => T) {
  return { get };
}

export function useAnimatedReaction<T>(
  read: () => T,
  react: (current: T, previous: T | null) => void,
) {
  useEffect(() => {
    let previous: T | null = null;
    const update = () => {
      const next = read();
      if (Object.is(next, previous)) return;
      const last = previous;
      previous = next;
      react(next, last);
    };
    reactions.add(update);
    update();
    return () => {
      reactions.delete(update);
    };
  }, [read, react]);
}
