import {
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { homeHeader } from '@/config/constants';

import type { HeroLock } from './useHeroLock.types';

/**
 * Spotify-style lock state machine for the home hero avatar. Pulling the
 * ScrollView down past `lockTriggerPx` of overscroll snaps the avatar into a
 * full-width hero and holds it; scrolling back up past `unlockScrollPx`
 * releases it. `lockState` is a discrete 0/1 latch so shading the trigger
 * boundary can't chatter; `lockProgress` is the continuous clock the styles
 * interpolate against. Range-matches `useThinkingReveal`'s reaction pattern.
 */
export function useHeroLock(scrollY: SharedValue<number>): HeroLock {
  const lockState = useSharedValue(0);
  const lockProgress = useSharedValue(0);

  useAnimatedReaction(
    () => scrollY.value,
    (y) => {
      if (lockState.value === 0 && -y >= homeHeader.lockTriggerPx) {
        lockState.value = 1;
        lockProgress.value = withTiming(1, { duration: homeHeader.lockTimingMs });
      } else if (lockState.value === 1 && y >= homeHeader.unlockScrollPx) {
        // Release only on a genuine scroll-up; the post-pull rubber-band settles
        // to y=0, which can never reach +unlockScrollPx, so it won't misfire.
        lockState.value = 0;
        lockProgress.value = withTiming(0, { duration: homeHeader.lockTimingMs });
      }
    },
  );

  return { lockProgress, lockState };
}
