import { useCallback } from 'react';
import { useAnimatedScrollHandler, useSharedValue, withTiming } from 'react-native-reanimated';

import { profileHero } from '@/utils/constants';

import { useHeroLock } from './useHeroLock';

/**
 * Single source of scroll state for the settings profile hero. Owns the
 * `scrollY` shared value (fed by the ScrollView's animated handler) and derives
 * the `lockProgress` clock via the platform lock machine. Both are handed down
 * to ProfileStickyBar / ProfileHero, which each keep their `useAnimatedStyle`
 * leaf-local. `toggleHeroLock` flips the same latch on tap (JS thread writes to
 * the shared values are synchronous and legal), driving the exact same
 * interpolation path as the iOS pull-to-lock gesture.
 */
export function useProfileHeaderAnimation() {
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const { lockProgress, lockState } = useHeroLock(scrollY);

  const toggleHeroLock = useCallback(() => {
    const next = lockState.value === 1 ? 0 : 1;
    // `lockState` is the discrete latch the pull machine reads; `lockProgress`
    // is the continuous clock every hero style interpolates against. Animating
    // it here plays the same expand/collapse as the iOS pull-to-lock gesture.
    lockState.value = next;
    lockProgress.value = withTiming(next, { duration: profileHero.lockTimingMs });
  }, [lockProgress, lockState]);

  return { lockProgress, lockState, onScroll, scrollY, toggleHeroLock };
}
