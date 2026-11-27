import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/** Tracks Reduce Motion dynamically across Accessibility Settings changes before and after mount. */
export function useLiveReducedMotion(): boolean {
  const initialReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(Boolean(initialReducedMotion));

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => {
        if (active) setReducedMotion(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReducedMotion(enabled);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}
