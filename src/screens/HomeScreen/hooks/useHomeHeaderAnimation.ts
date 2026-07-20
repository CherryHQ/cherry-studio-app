import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { useHeroLock } from './useHeroLock';

/**
 * Single source of scroll state for the home sticky header. Owns the `scrollY`
 * shared value (fed by the ScrollView's animated handler) and derives the
 * `lockProgress` clock via the platform lock machine. Both are handed down to
 * HomeStickyBar / HomeProfileHero, which each keep their `useAnimatedStyle`
 * leaf-local.
 */
export function useHomeHeaderAnimation() {
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const { lockProgress, lockState } = useHeroLock(scrollY);

  return { lockProgress, lockState, onScroll, scrollY };
}
