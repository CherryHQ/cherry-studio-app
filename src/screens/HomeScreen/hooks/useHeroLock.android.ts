import { type SharedValue, useSharedValue } from 'react-native-reanimated';

import type { HeroLock } from './useHeroLock.types';

/**
 * Android has no rubber-band overscroll, so pull-to-expand / lock can never be
 * reached. Both values stay frozen at 0 → every lock-driven interpolation
 * collapses to its resting value, leaving only the scroll-out cross-fade
 * active. The `scrollY` arg is accepted for signature parity.
 */
export function useHeroLock(_scrollY: SharedValue<number>): HeroLock {
  const lockState = useSharedValue(0);
  const lockProgress = useSharedValue(0);
  return { lockProgress, lockState };
}
