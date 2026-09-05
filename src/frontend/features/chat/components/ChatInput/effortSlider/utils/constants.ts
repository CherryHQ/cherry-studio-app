import { Easing } from 'react-native-reanimated';

/**
 * Snap animation for release-after-drag and programmatic value changes.
 * The web original uses a bouncy spring (stiffness 920 / damping 40); that
 * overshoot read as too playful here, so the port snaps with a plain
 * ease-out — pure deceleration into the stop, no rebound ever.
 */
export const effortSliderSnapTiming = {
  duration: 200,
  easing: Easing.out(Easing.cubic),
} as const;

/**
 * Magnet radius as a fraction of the gap between two adjacent stops: while
 * dragging, positions closer than this to a stop get pulled toward it.
 */
export const effortSliderMagnetRadius = 0.5;
