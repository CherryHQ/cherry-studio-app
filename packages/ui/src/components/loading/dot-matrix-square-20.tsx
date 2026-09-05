import {
  DOT_MATRIX_CELL_COUNT,
  DotMatrixBase,
  type DotMatrixLoaderProps,
  rowMajorIndex,
} from './dot-matrix-base';

const CYCLE_DURATION_MS = 1600;
const BASE_OPACITY = 0.08;
const IDLE_RING_OPACITY = 0.48;
const TWIST_INNER_OPACITY = 0.52;
const SEAM_PULSE_OPACITY = 0.55;
const TAIL_OPACITIES = [1, 0.82, 0.64, 0.46, 0.3, 0.18] as const;
const BACK_TAIL_OPACITIES = [0.38, 0.3, 0.22, 0.14] as const;

const PERIMETER_PATH = [
  rowMajorIndex(0, 0),
  rowMajorIndex(0, 1),
  rowMajorIndex(0, 2),
  rowMajorIndex(0, 3),
  rowMajorIndex(0, 4),
  rowMajorIndex(1, 4),
  rowMajorIndex(2, 4),
  rowMajorIndex(3, 4),
  rowMajorIndex(4, 4),
  rowMajorIndex(4, 3),
  rowMajorIndex(4, 2),
  rowMajorIndex(4, 1),
  rowMajorIndex(4, 0),
  rowMajorIndex(3, 0),
  rowMajorIndex(2, 0),
  rowMajorIndex(1, 0),
] as const;

const STEP_COUNT = PERIMETER_PATH.length;
const PATH_STEP_BY_INDEX = Array.from({ length: DOT_MATRIX_CELL_COUNT }, (_, index) =>
  PERIMETER_PATH.indexOf(index as (typeof PERIMETER_PATH)[number]),
);
const TWIST_INNER_BY_STEP = Array.from({ length: STEP_COUNT }, () => -1);
TWIST_INNER_BY_STEP[0] = rowMajorIndex(1, 1);
TWIST_INNER_BY_STEP[4] = rowMajorIndex(1, 3);
TWIST_INNER_BY_STEP[8] = rowMajorIndex(3, 3);
TWIST_INNER_BY_STEP[12] = rowMajorIndex(3, 1);

const SEAM_INDEX = rowMajorIndex(2, 2);
const IDLE_OPACITIES = PATH_STEP_BY_INDEX.map((pathStep, index) => {
  if (pathStep >= 0) return IDLE_RING_OPACITY;
  return index === SEAM_INDEX ? 0.22 : BASE_OPACITY;
});
const FRAME_OPACITIES = buildFrameOpacities();

export type DotMatrixSquare20Props = DotMatrixLoaderProps;

export function DotMatrixSquare20(props: DotMatrixSquare20Props) {
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
    const index = flatIndex % DOT_MATRIX_CELL_COUNT;
    const pathStep = PATH_STEP_BY_INDEX[index] ?? -1;
    let opacity = BASE_OPACITY;

    if (pathStep >= 0) {
      const backHead = (step + STEP_COUNT / 2) % STEP_COUNT;
      const forwardDistance = (step - pathStep + STEP_COUNT) % STEP_COUNT;
      const backDistance = (backHead - pathStep + STEP_COUNT) % STEP_COUNT;
      opacity = Math.max(
        opacity,
        TAIL_OPACITIES[forwardDistance] ?? 0,
        BACK_TAIL_OPACITIES[backDistance] ?? 0,
      );
    }

    if (TWIST_INNER_BY_STEP[step] === index) {
      opacity = Math.max(opacity, TWIST_INNER_OPACITY);
    }
    if (index === SEAM_INDEX && step % 4 === 0) {
      opacity = Math.max(opacity, SEAM_PULSE_OPACITY);
    }

    return Math.min(1, opacity);
  });
}
