import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

const listeners = new Set<() => void>();
let preference: boolean | undefined;
let subscription: ReturnType<typeof AccessibilityInfo.addEventListener> | undefined;

function update(enabled: boolean) {
  if (preference === enabled) return;
  preference = enabled;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!subscription) {
    const current = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    subscription = current;
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => {
        // A newer event or a later mount takes precedence over this initial read.
        if (subscription === current && preference === undefined) update(enabled);
      },
      () => undefined,
    );
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      subscription?.remove();
      subscription = undefined;
      preference = undefined;
    }
  };
}

// Show the static press state until the first native reading is available.
const getSnapshot = () => preference ?? true;

export function useButtonReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
