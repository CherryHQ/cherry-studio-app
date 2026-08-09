import { buildDiagonalSweepOrder } from './diagonal-sweep-order';
import { DOT_MATRIX_CELL_COUNT, DotMatrixBase, type DotMatrixLoaderProps } from './dot-matrix-base';

const CYCLE_DURATION_MS = 1400;
const FRAME_COUNT = 84;
const PEAK_OPACITY = 1;
const REST_OPACITY = 0.14;
const IDLE_OPACITY = 0.45;
const FADE_SPAN = 0.34;
const SWEEP_SPAN = 0.9;

const ORDER_FRACTIONS = buildDiagonalSweepOrder(5).map(
  (order) => order / (DOT_MATRIX_CELL_COUNT - 1),
);
const FRAME_OPACITIES = buildFrameOpacities();
const IDLE_OPACITIES = Array.from({ length: DOT_MATRIX_CELL_COUNT }, () => IDLE_OPACITY);

export type PrismSweepProps = DotMatrixLoaderProps;

export function PrismSweep(props: PrismSweepProps) {
  return (
    <DotMatrixBase
      {...props}
      cycleDurationMs={CYCLE_DURATION_MS}
      frameOpacities={FRAME_OPACITIES}
      idleOpacities={IDLE_OPACITIES}
    />
  );
}

function resolveOpacity(progress: number, index: number): number {
  const orderFraction = ORDER_FRACTIONS[index] ?? 0;
  const localPhase = (((progress - orderFraction * SWEEP_SPAN) % 1) + 1) % 1;

  if (localPhase <= 0.05) {
    return interpolateSegment(localPhase, 0, 0.05, PEAK_OPACITY, 0.82);
  }
  if (localPhase <= 0.12) {
    return interpolateSegment(localPhase, 0.05, 0.12, 0.82, 0.55);
  }
  if (localPhase <= 0.22) {
    return interpolateSegment(localPhase, 0.12, 0.22, 0.55, 0.32);
  }
  if (localPhase <= FADE_SPAN) {
    return interpolateSegment(localPhase, 0.22, FADE_SPAN, 0.32, REST_OPACITY);
  }

  return REST_OPACITY;
}

function buildFrameOpacities(): number[] {
  return Array.from({ length: FRAME_COUNT * DOT_MATRIX_CELL_COUNT }, (_, flatIndex) => {
    const frame = Math.floor(flatIndex / DOT_MATRIX_CELL_COUNT);
    const index = flatIndex % DOT_MATRIX_CELL_COUNT;
    return resolveOpacity(frame / FRAME_COUNT, index);
  });
}

function interpolateSegment(
  value: number,
  inputStart: number,
  inputEnd: number,
  outputStart: number,
  outputEnd: number,
): number {
  const progress = (value - inputStart) / (inputEnd - inputStart);
  return outputStart + progress * (outputEnd - outputStart);
}
