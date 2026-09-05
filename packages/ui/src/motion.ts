// The package's motion vocabulary.
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
} as const;

// Springs are curves too, so they live here rather than in a component. They
// carry no duration axis on purpose: a critically damped spring takes the same
// time to settle however far it travels, which is the property that makes one
// safe to share across gestures whose distances are decided at runtime.
export const spring = {
  /**
   * Critically damped: the fastest arrival that never overshoots. For something
   * travelling to a position that has to be exact — a pinned row, a snap target
   * — where an overshoot would read as the thing missing and coming back.
   *
   * `stiffness = (1/tau)^2` and `damping = 2/tau` for a unit mass, so this is a
   * 63.5ms time constant: ~99% of the distance in 420ms.
   */
  settle: { damping: 31.5, mass: 1, stiffness: 248 },
} as const;

export const duration = {
  /** Cross-fades, and anything that should be over before a shape settles. */
  fast: 200,
  /** Size and position changes. */
  base: 250,
  /** Long enough for an overshoot to read as one rather than as a wobble. */
  slow: 350,
} as const;

/** Continuous glyph highlight used by shared loading and pending-state copy. */
export const shimmerTextMotion = {
  duration: 2000,
  easing: easing.linear,
} as const;
