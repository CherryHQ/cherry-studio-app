import {
  DOT_MATRIX_CELL_COUNT,
  DOT_MATRIX_SIZE,
  DotMatrixBase,
  type DotMatrixLoaderProps,
} from './dot-matrix-base';

const CYCLE_DURATION_MS = 1700;
const STEP_COUNT = 48;
const BASE_OPACITY = 0.08;
const SECONDARY_TRAIL_OPACITY = 0.32;
const PRIMARY_TRAIL_OPACITY = 0.62;
const PEAK_OPACITY = 1;
const CURVE_OPACITY = 0.2;

type Point = Readonly<{ x: number; y: number }>;

const GRID_POINTS = Array.from({ length: DOT_MATRIX_CELL_COUNT }, (_, index) =>
  gridPoint(Math.floor(index / DOT_MATRIX_SIZE), index % DOT_MATRIX_SIZE),
);
const CURVE_SAMPLES: readonly Point[] = Array.from({ length: 96 }, (_, index) => {
  const angle = (index / 96) * Math.PI * 2;
  return { x: Math.sin(angle), y: 0.58 * Math.sin(2 * angle) };
});
const IDLE_OPACITIES = GRID_POINTS.map(resolveIdleOpacity);
const FRAME_OPACITIES = buildFrameOpacities();

export type DotMatrixSquare19Props = DotMatrixLoaderProps;

export function DotMatrixSquare19(props: DotMatrixSquare19Props) {
  return (
    <DotMatrixBase
      {...props}
      cycleDurationMs={CYCLE_DURATION_MS}
      frameOpacities={FRAME_OPACITIES}
      idleOpacities={IDLE_OPACITIES}
    />
  );
}

function buildFrameOpacities(): number[] {
  return Array.from({ length: STEP_COUNT * DOT_MATRIX_CELL_COUNT }, (_, flatIndex) => {
    const step = Math.floor(flatIndex / DOT_MATRIX_CELL_COUNT);
    const dot = GRID_POINTS[flatIndex % DOT_MATRIX_CELL_COUNT];
    if (!dot) return BASE_OPACITY;

    const headA = loopPoint(step);
    const headB = loopPoint(step + STEP_COUNT / 2);
    const trailA = loopPoint(step - 4);
    const trailB = loopPoint(step + STEP_COUNT / 2 - 4);
    const lead = Math.max(headInfluence(dot, headA), headInfluence(dot, headB));
    const trail = Math.max(headInfluence(dot, trailA), headInfluence(dot, trailB));
    const centerPulse = Math.exp(-(dot.x * dot.x + dot.y * dot.y) / 0.05) * (0.45 + 0.55 * lead);

    return Math.min(
      PEAK_OPACITY,
      BASE_OPACITY +
        SECONDARY_TRAIL_OPACITY * trail +
        PRIMARY_TRAIL_OPACITY * lead +
        0.16 * centerPulse,
    );
  });
}

function resolveIdleOpacity(dot: Point): number {
  const curveGlow = Math.exp(-minCurveDistanceSquared(dot) / 0.2);
  const centerBoost = Math.exp(-(dot.x * dot.x + dot.y * dot.y) / 0.06);
  return Math.min(PEAK_OPACITY, BASE_OPACITY + curveGlow * CURVE_OPACITY + centerBoost * 0.18);
}

function gridPoint(row: number, column: number): Point {
  return { x: (column - 2) / 2, y: (2 - row) / 2 };
}

function loopPoint(step: number): Point {
  const angle = (((step % STEP_COUNT) + STEP_COUNT) / STEP_COUNT) * Math.PI * 2;
  return { x: Math.sin(angle), y: 0.58 * Math.sin(2 * angle) };
}

function squaredDistance(a: Point, b: Point): number {
  const deltaX = a.x - b.x;
  const deltaY = a.y - b.y;
  return deltaX * deltaX + deltaY * deltaY;
}

function minCurveDistanceSquared(point: Point): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const sample of CURVE_SAMPLES) {
    minimum = Math.min(minimum, squaredDistance(point, sample));
  }
  return minimum;
}

function headInfluence(dot: Point, head: Point): number {
  return Math.exp(-squaredDistance(dot, head) / 0.19);
}
