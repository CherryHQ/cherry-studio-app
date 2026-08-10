import {
  DOT_MATRIX_CELL_COUNT,
  DOT_MATRIX_SIZE,
  DotMatrixBase,
  type DotMatrixLoaderProps,
} from './dot-matrix-base';

const CYCLE_DURATION_MS = 1200;
const STEP_OPACITIES = [0.704, 0.492, 0.256, 0.192, 0.1] as const;
const FRAME_OPACITIES = buildFrameOpacities();
const IDLE_OPACITIES = Array.from({ length: DOT_MATRIX_CELL_COUNT }, (_, index) => {
  const row = Math.floor(index / DOT_MATRIX_SIZE);
  const column = index % DOT_MATRIX_SIZE;
  const position = column % 2 === 0 ? DOT_MATRIX_SIZE - 1 - row : row;
  return 0.22 + (position / (DOT_MATRIX_SIZE - 1)) * 0.66;
});

export type DotMatrixSquare6Props = DotMatrixLoaderProps;

export function DotMatrixSquare6(props: DotMatrixSquare6Props) {
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
  return Array.from({ length: DOT_MATRIX_SIZE * DOT_MATRIX_CELL_COUNT }, (_, flatIndex) => {
    const step = Math.floor(flatIndex / DOT_MATRIX_CELL_COUNT);
    const index = flatIndex % DOT_MATRIX_CELL_COUNT;
    const row = Math.floor(index / DOT_MATRIX_SIZE);
    const column = index % DOT_MATRIX_SIZE;
    const position = column % 2 === 0 ? DOT_MATRIX_SIZE - 1 - row : row;
    const localStep = (step - position + DOT_MATRIX_SIZE) % DOT_MATRIX_SIZE;
    return STEP_OPACITIES[localStep] ?? STEP_OPACITIES[STEP_OPACITIES.length - 1];
  });
}
