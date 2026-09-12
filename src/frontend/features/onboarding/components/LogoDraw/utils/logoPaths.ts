import { arcPoint, buildArcSweep, fmtPoint } from './logoDrawMath';

/**
 * Logo geometry. All coordinates are in the source-SVG user space
 * (viewBox `0 0 64.44 66.73`, y-down).
 *
 * The three fill paths are copied verbatim from the brand SVG
 * (`资源 2svg版.svg`). They are filled outlines, not strokes, so the draw
 * animation reveals them through masks: each mask is a thick round-cap
 * stroke that grows along a hand-reconstructed *centerline* of the original
 * pen stroke (Skia `Path` end-trim). Reverse-engineering notes:
 *
 * - Both swirls are ~12-unit-thick ring strokes: outer rim r≈17.05, inner
 *   edge = a small r≈4.94 circular *hole* concentric with each ring center
 *   (verified by ray casting — the small circles are negative space, not
 *   filled discs). A radius-11.1 arc centerline with a stroke width of 13
 *   therefore covers the whole band.
 * - Round end caps (r≈4.28) sit where each pen stroke starts/ends; the
 *   centerlines begin/end at those cap centers so the growing mask covers
 *   the caps from the first frame.
 * - The right swirl is one continuous S-stroke: lower ring (center O2) →
 *   waist → upper ring (center O3). Its start cap nearly coincides with the
 *   left swirl's bottom cap (the two shapes interlock there), which makes
 *   the left→right handoff read as one continuous gesture.
 */

/** Left swirl fill (`.cls-1` #1 in the source SVG). */
export const SWIRL_LEFT_FILL =
  'M16.72,51.21c-4.45,0-8.64-1.78-11.81-5.01-3.17-3.23-4.91-7.51-4.91-12.04s1.74-8.81,4.91-12.04,7.36-5.01,11.81-5.01,8.71,1.82,11.82,4.99c2.32,2.36,2.32,6.2,0,8.56-2.32,2.36-6.08,2.36-8.4,0-.9-.92-2.15-1.45-3.43-1.45-2.63,0-4.85,2.26-4.85,4.94s2.22,4.94,4.85,4.94c1.28,0,2.52-.53,3.43-1.45,2.32-2.36,6.08-2.36,8.4,0,2.32,2.36,2.32,6.2,0,8.56-3.11,3.17-7.42,4.99-11.82,4.99Z';

/** Right swirl fill (`.cls-1` #2). */
export const SWIRL_RIGHT_FILL =
  'M32.05,66.73c-4.45,0-8.64-1.78-11.81-5.01s-4.91-7.51-4.91-12.04,1.79-8.88,4.9-12.06c2.32-2.36,6.08-2.36,8.4,0,2.32,2.36,2.32,6.2,0,8.56-.9.92-1.42,2.19-1.42,3.49,0,2.68,2.22,4.94,4.85,4.94s4.85-2.26,4.85-4.94c0-.95-.23-2.31-1.32-3.43-3.13-3.19-4.92-7.6-4.92-12.09s1.74-8.81,4.91-12.04,7.36-5.01,11.81-5.01,8.64,1.78,11.81,5.01,4.91,7.51,4.91,12.04-1.79,8.88-4.9,12.06c-2.32,2.36-6.08,2.36-8.4,0-2.32-2.36-2.32-6.2,0-8.56.9-.92,1.42-2.19,1.42-3.49,0-2.68-2.22-4.94-4.85-4.94s-4.85,2.26-4.85,4.94c0,1.31.53,2.6,1.45,3.53,3.1,3.16,4.8,7.42,4.8,11.99s-1.74,8.81-4.91,12.04c-3.17,3.23-7.36,5.01-11.81,5.01Z';

/** Check mark fill (`.cls-2`). */
export const CHECK_FILL =
  'M32.05,19.09l-9.72-9.12c-1.5-1.4-1.57-3.75-.17-5.25,1.4-1.49,3.75-1.57,5.25-.17l3.89,3.65,5.53-6.83c1.29-1.59,3.63-1.84,5.22-.55,1.59,1.29,1.84,3.63.55,5.22l-10.56,13.05Z';

/** Ring centers of the left swirl (O1), lower-right ring (O2), upper-right ring (O3). */
export const SWIRL_LEFT_CENTER = { x: 16.72, y: 34.16 };
export const SWIRL_LOWER_CENTER = { x: 32.05, y: 49.68 };
export const SWIRL_UPPER_CENTER = { x: 47.39, y: 34.15 };

/** Centerline arc radius — midway across the [4.94, 17.05] ring band. */
const ARC_RADIUS = 11.1;

/** Pen-stroke end-cap centers (round caps, r≈4.28). */
const LEFT_CAP_TOP = { x: 28.54, y: 26.38 };
const LEFT_CAP_BOTTOM = { x: 28.54, y: 41.92 };
const RIGHT_CAP_END = { x: 50.81, y: 41.93 };

/** Angular positions (deg) where lips/rims meet, from the fill-path anchors. */
const LEFT_LIP_DEG = 33.35;
/**
 * Where the lower-ring sweep starts. The lower ring is a near-closed hook
 * with a ~6-unit mouth at its top between the interlock lip (~246°) and the
 * arch that leads to the waist (~270°). A round mask nib (half-width 6.3)
 * placed inside that mouth bridges it and reveals the far arch as a sliver
 * detached from the growing outer-rim blob (it only rejoins once the sweep
 * comes all the way around ~0.3 later). Starting the sweep at 231° — just
 * below the mouth, so the start nib covers the interlock lip yet stays 7.8
 * units from the arch (> 6.3) — keeps every revealed frame a single
 * connected blob. The nib still sits 3.6 units from the C's bottom lip
 * (< 6.3), so the handoff from the left swirl still reads as continuous.
 */
const LOWER_RIM_FROM_DEG = 231;
const UPPER_RIM_TO_DEG = 405.6;

/**
 * Left swirl centerline: short radial lead-in from the top cap center,
 * a 293° arc around O1 (top → left → bottom, i.e. counter-clockwise on
 * screen), then a radial lead-out onto the bottom cap center.
 */
function buildSwirlLeftCenterline(): string {
  const c = SWIRL_LEFT_CENTER;
  const start = arcPoint(c.x, c.y, ARC_RADIUS, -LEFT_LIP_DEG);
  const sweep = buildArcSweep(c.x, c.y, ARC_RADIUS, -LEFT_LIP_DEG, -(360 - LEFT_LIP_DEG));
  return `M ${fmtPoint(LEFT_CAP_TOP)} L ${fmtPoint(start)} ${sweep} L ${fmtPoint(LEFT_CAP_BOTTOM)}`;
}

/**
 * Right swirl centerline, one continuous S-stroke: it starts on the lower
 * ring at 231° (see LOWER_RIM_FROM_DEG — no separate cap lead-in, which is
 * what used to bridge the mouth), sweeps the lower-ring arc (231° → 0°
 * through the bottom), runs a waist cubic whose tangents point straight up
 * on both ends, sweeps the upper-ring arc (180° → 405.6° over the top), and
 * leads out onto the end cap.
 */
function buildSwirlRightCenterline(): string {
  const lo = SWIRL_LOWER_CENTER;
  const up = SWIRL_UPPER_CENTER;
  const lowerStart = arcPoint(lo.x, lo.y, ARC_RADIUS, LOWER_RIM_FROM_DEG);
  const lowerSweep = buildArcSweep(lo.x, lo.y, ARC_RADIUS, LOWER_RIM_FROM_DEG, 0);
  const lowerEnd = arcPoint(lo.x, lo.y, ARC_RADIUS, 0);
  const upperStart = arcPoint(up.x, up.y, ARC_RADIUS, 180);
  const upperSweep = buildArcSweep(up.x, up.y, ARC_RADIUS, 180, UPPER_RIM_TO_DEG);
  const waistPull = 5.5;
  const waist =
    `C ${fmtPoint({ x: lowerEnd.x, y: lowerEnd.y - waistPull })} ` +
    `${fmtPoint({ x: upperStart.x, y: upperStart.y + waistPull })} ${fmtPoint(upperStart)}`;
  return (
    `M ${fmtPoint(lowerStart)} ${lowerSweep} ` +
    `${waist} ${upperSweep} L ${fmtPoint(RIGHT_CAP_END)}`
  );
}

/** Check centerline: two straight strokes through the tick, left to right. */
function buildCheckCenterline(): string {
  return 'M 24.87 7.26 L 31.68 13.65 L 39.72 3.71';
}

export const SWIRL_LEFT_CENTERLINE = buildSwirlLeftCenterline();
export const SWIRL_RIGHT_CENTERLINE = buildSwirlRightCenterline();
export const CHECK_CENTERLINE = buildCheckCenterline();

/** Center of the check's bounding box — pivot for the landing rebound scale. */
export const CHECK_PIVOT = { x: 32.3, y: 9.3 };
