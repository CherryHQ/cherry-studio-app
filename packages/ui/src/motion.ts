// The package's motion vocabulary across four tiers (Tactile, Morph, Spatial, Ambient).
//
// Curves and durations are separate axes on purpose. A curve is a design token:
// it means the same thing however far the thing travels, so it is shared. A
// duration is tuned to the distance, so it is picked per gesture. Components
// pair the two and name the pairing after the gesture it belongs to, rather than
// exporting their own curve and drifting from everything else.

import { Easing } from 'react-native-reanimated';

export const easing = {
  /** Constant velocity for progress loops that should not settle between cycles. */
  linear: Easing.linear,
  /**
   * Overshoots past the target and comes back — the y=1.25 control point. For
   * something appearing out of nothing, where the overshoot is the arrival.
   */
  overshoot: Easing.bezier(0.34, 1.25, 0.64, 1),
  /**
   * Pure deceleration: fast off the mark, then a hard settle. The default, and
   * the right one for anything that changes an existing thing's size or place.
   */
  settle: Easing.bezier(0.22, 1, 0.36, 1),
  /** Smooth symmetric curve for on-screen morphs without pure ease-in sluggishness. */
  inOut: Easing.bezier(0.42, 0, 0.2, 1),
  /** Soft deceleration matched to mobile sheets, drawers, and floating capsules. */
  sheet: Easing.bezier(0.32, 0.72, 0, 1),
} as const;

// Springs are curves too, so they live here rather than in a component. They
// carry no duration axis on purpose: a spring settles by physics across variable
// distances, which is the property that makes one safe to share across runtime
// gesture amplitudes.
export const spring = {
  /**
   * Responsive, soft-landing spring for tactile press recovery and crisp icon
   * swaps without wobble.
   */
  tactile: { damping: 24, mass: 0.8, stiffness: 420 },
  /**
   * Warm, gently lively spring for in-place state morphs (send/stop swaps,
   * copy confirmation, anchored chips).
   */
  morph: { damping: 22, mass: 0.9, stiffness: 300 },
  /**
   * Critically damped: the fastest arrival that never overshoots. For something
   * travelling to a position that has to be exact — a pinned row, a snap target
   * — where an overshoot would read as the thing missing and coming back.
   *
   * `stiffness = (1/tau)^2` and `damping = 2/tau` for a unit mass, so this is a
   * 63.5ms time constant: ~99% of the distance in 420ms.
   */
  settle: { damping: 31.5, mass: 1, stiffness: 248 },
  /** Unhurried, warm spatial entrance for welcome anchors and ambient reveals. */
  gentle: { damping: 26, mass: 1, stiffness: 180 },
} as const;

export const duration = {
  /** Tactile press-in and crisp micro-state swaps. */
  instant: 120,
  /** Cross-fades, and anything that should be over before a shape settles. */
  fast: 200,
  /** Size and position changes. */
  base: 250,
  /** Long enough for an overshoot to read as one rather than as a wobble. */
  slow: 350,
} as const;

/** Shared tactile press-in and spring recovery tokens for interactive controls. */
export const pressMotion = {
  scale: 0.97,
  subtleScale: 0.985,
  pressIn: { duration: 110, easing: easing.settle },
  pressOut: spring.tactile,
} as const;

/** Calm, breathing timing tokens for active AI waiting and progress states. */
export const ambientMotion = {
  pulseDuration: 1400,
  shimmerDuration: 2000,
} as const;

/** Continuous glyph highlight used by shared loading and pending-state copy. */
export const shimmerTextMotion = {
  duration: ambientMotion.shimmerDuration,
  easing: easing.linear,
} as const;
