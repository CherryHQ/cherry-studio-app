import { Easing } from 'react-native-reanimated';

/**
 * Tuning constants for the logo draw animation. The mask centerline
 * geometry itself lives in `logoPaths.ts`; the values here are stroke
 * widths, the master-progress timeline, and the reanimated configs.
 */

/**
 * Logo bounds in source-SVG user units. The ink spans x ∈ [-0.33, 64.44]
 * (left rim curve → upper-ring right rim) and y ∈ [-0.2, 66.73] (check
 * curve bulge → lower-ring bottom); a 0.5-unit inset on every side keeps
 * those sub-unit overshoots inside the Canvas, which clips at its bounds.
 */
export const LOGO_VIEWBOX_INSET = 0.5;
export const LOGO_VIEWBOX_WIDTH = 64.44 + 2 * LOGO_VIEWBOX_INSET;
export const LOGO_VIEWBOX_HEIGHT = 66.73 + 2 * LOGO_VIEWBOX_INSET;

/** Width-over-height aspect ratio of the logo drawing area. */
export const LOGO_ASPECT_RATIO = LOGO_VIEWBOX_WIDTH / LOGO_VIEWBOX_HEIGHT;

/**
 * Mask stroke widths in viewBox units. The swirl stroke spans the radial
 * band [4.94, 17.05] (hole edge → outer rim) around a radius-11.1
 * centerline, so 12.6 covers it with margin on both sides; wider would be
 * safer against gaps but the right swirl's start nib must stay clear of
 * the nearby waist band (see RIGHT_STROKE_START in logoPaths.ts). The
 * check stroke covers the 7.42-wide tick with ~0.8 margin per side.
 */
export const SWIRL_MASK_STROKE_WIDTH = 12.6;
export const CHECK_MASK_STROKE_WIDTH = 9;

/**
 * Master-progress sub-segments, sized roughly by centerline arc length
 * (left swirl ≈ 63 units, right swirl ≈ 114) so the pen speed stays even.
 * The [0.80, 0.84] gap is a deliberate beat before the green check lands.
 */
export const LOGO_DRAW_SEGMENTS = {
  swirlLeft: { from: 0, to: 0.3 },
  swirlRight: { from: 0.3, to: 0.8 },
  check: { from: 0.84, to: 1 },
} as const;

/** Timing for the orange phase: progress 0 → check.from, ease-in-out. */
export const logoDrawTiming = {
  duration: 1300,
  easing: Easing.inOut(Easing.cubic),
} as const;

/**
 * Spring that lands the green check. Its overshoot past progress=1 is safe:
 * every trim interpolation clamps, and the check group scale consumes the
 * overshoot as a small rebound instead.
 */
export const checkSpringConfig = {
  damping: 14,
  stiffness: 180,
} as const;

/** Peak extra scale the check group reaches while the spring overshoots. */
export const CHECK_OVERSHOOT_SCALE = 1.04;

/** Progress overshoot (past 1) that maps onto the peak check scale. */
export const CHECK_OVERSHOOT_RANGE = 0.06;
