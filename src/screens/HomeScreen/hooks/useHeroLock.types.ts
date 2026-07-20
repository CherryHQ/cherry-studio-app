import type { SharedValue } from 'react-native-reanimated';

/**
 * `lockState` is the discrete 0/1 latch the hero image's chase animation
 * targets; `lockProgress` is the continuous 500ms clock the overlaid name
 * interpolates against. Timings live in the reaction instead of an animated
 * style, so per-frame reads cannot restart them.
 */
export type HeroLock = {
  lockState: SharedValue<number>;
  lockProgress: SharedValue<number>;
};
