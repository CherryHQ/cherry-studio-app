import { Easing } from 'react-native-reanimated';

/**
 * Shared tuning constants for the effort slider and its "thinking pixel field".
 *
 * The pixel-field cell geometry (6dp cells, 1.1dp gaps) and the flow/flicker
 * timings live inside the SkSL source (`shaders/thinkingPixelField.ts`) as
 * shader constants; the values here are the ones JS needs to agree on.
 */

/**
 * Shader clock wrap period in seconds. Every animation period inside the
 * shader divides this value exactly (4 s flow cycle, quantized flicker
 * buckets, whole sine cycles for tone drift), so wrapping the clock back to 0
 * is invisible. Keep in sync with `WRAP` in the SkSL source.
 */
export const THINKING_CLOCK_WRAP_SECONDS = 120;

/** Reveal sweep duration when the field ignites (matches the web original). */
export const THINKING_REVEAL_DURATION_MS = 1000;

/** Whole-field fade-out duration when leaving the trigger stop. */
export const THINKING_FADE_OUT_MS = 220;

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
