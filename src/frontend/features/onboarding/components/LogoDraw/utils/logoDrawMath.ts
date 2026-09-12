/**
 * Pure geometry helpers for the logo draw animation. No Skia or React
 * dependencies so everything here is unit-testable in plain jest.
 *
 * Angle convention: SVG user space is y-down, so 0° points right (+x) and
 * angles grow toward +y (visually clockwise on screen). `arcPoint(…, -90)`
 * is the top of the circle.
 */

export type Point = { x: number; y: number };

const DEG_TO_RAD = Math.PI / 180;

/** Point on the circle centered at (cx, cy) with radius r at `deg` degrees. */
export function arcPoint(cx: number, cy: number, r: number, deg: number): Point {
  const rad = deg * DEG_TO_RAD;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

const fmt = (n: number): string => String(Number(n.toFixed(2)));

/** `x y` pair formatted for an SVG path string. */
export function fmtPoint(p: Point): string {
  return `${fmt(p.x)} ${fmt(p.y)}`;
}

/**
 * SVG arc commands sweeping the circle centered at (cx, cy) from `fromDeg`
 * to `toDeg`. The sweep may exceed 180° and may run backwards (toDeg <
 * fromDeg); it is split into ≤90° `A` segments so the large-arc flag stays
 * unambiguous. Returns the command string *without* a leading move — callers
 * chain it onto a subpath already positioned at the `fromDeg` point.
 */
export function buildArcSweep(
  cx: number,
  cy: number,
  r: number,
  fromDeg: number,
  toDeg: number,
): string {
  const total = toDeg - fromDeg;
  const segments = Math.max(1, Math.ceil(Math.abs(total) / 90));
  const sweepFlag = total >= 0 ? 1 : 0;
  const parts: string[] = [];
  for (let i = 1; i <= segments; i++) {
    const p = arcPoint(cx, cy, r, fromDeg + (total * i) / segments);
    parts.push(`A ${fmt(r)} ${fmt(r)} 0 0 ${sweepFlag} ${fmtPoint(p)}`);
  }
  return parts.join(' ');
}

/**
 * Maps master progress onto a [from, to] sub-segment, clamped to [0, 1].
 * Runs inside useDerivedValue, hence the worklet directive. A degenerate
 * segment (to <= from) acts as a step at `to`.
 */
export function segmentProgress(progress: number, from: number, to: number): number {
  'worklet';
  if (to <= from) {
    return progress >= to ? 1 : 0;
  }
  const t = (progress - from) / (to - from);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
