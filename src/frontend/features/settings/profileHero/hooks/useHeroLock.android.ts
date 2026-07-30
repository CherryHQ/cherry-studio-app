import {
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { profileHero } from '@/frontend/utils/constants';

import type { HeroLock } from './useHeroLock.types';

/**
 * Android has no rubber-band overscroll, so the hero lock can only be entered
 * by tapping the avatar (`toggleHeroLock`), never by pulling down. This
 * reaction adds the matching exit: once locked, scrolling up past
 * `unlockScrollPx` releases it, mirroring iOS. Tapping again also releases it.
 */
export function useHeroLock(scrollY: SharedValue<number>): HeroLock {
  const lockState = useSharedValue(0);
  const lockProgress = useSharedValue(0);

  useAnimatedReaction(
    () => scrollY.value,
    (y) => {
      if (lockState.value === 1 && y >= profileHero.unlockScrollPx) {
        lockState.value = 0;
        lockProgress.value = withTiming(0, { duration: profileHero.lockTimingMs });
      }
    },
  );

  return { lockProgress, lockState };
}
