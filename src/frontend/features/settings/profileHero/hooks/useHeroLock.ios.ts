import {
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { profileHero } from '@/frontend/utils/constants';

import type { HeroLock } from './useHeroLock.types';

/**
 * Spotify-style lock state machine for the profile hero avatar. Pulling the
 * ScrollView down past `lockTriggerPx` of overscroll snaps the avatar into a
 * full-width hero and holds it; scrolling back up past `unlockScrollPx`
 * releases it (a tap on the avatar toggles the same latch). `lockState` is a
 * discrete 0/1 latch so shading the trigger boundary can't chatter;
 * `lockProgress` is the continuous clock the styles interpolate against.
 */
export function useHeroLock(scrollY: SharedValue<number>): HeroLock {
  const lockState = useSharedValue(0);
  const lockProgress = useSharedValue(0);

  useAnimatedReaction(
    () => scrollY.value,
    (y) => {
      if (lockState.value === 0 && -y >= profileHero.lockTriggerPx) {
        lockState.value = 1;
        lockProgress.value = withTiming(1, { duration: profileHero.lockTimingMs });
      } else if (lockState.value === 1 && y >= profileHero.unlockScrollPx) {
        // Release only on a genuine scroll-up; the post-pull rubber-band settles
        // to y=0, which can never reach +unlockScrollPx, so it won't misfire.
        lockState.value = 0;
        lockProgress.value = withTiming(0, { duration: profileHero.lockTimingMs });
      }
    },
  );

  return { lockProgress, lockState };
}
