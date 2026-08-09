import {
  DOT_MATRIX_CELL_COUNT,
  DotMatrixBase,
  type DotMatrixLoaderProps,
  rowMajorIndex,
} from './dot-matrix-base';

const CYCLE_DURATION_MS = 1500;
const SNAKE_TAIL = [1, 0.82, 0.68, 0.54, 0.42, 0.31, 0.22, 0.14] as const;
const BASE_OPACITY = 0.08;

const ROW_CYCLE_PATH = buildRowCyclePath();
const STEP_COUNT = ROW_CYCLE_PATH.length;
const FRAME_OPACITIES = buildFrameOpacities();
const IDLE_OPACITIES = FRAME_OPACITIES.slice(0, DOT_MATRIX_CELL_COUNT);

export type DotMatrixSquare2Props = DotMatrixLoaderProps;

export function DotMatrixSquare2(props: DotMatrixSquare2Props) {
  return (
    <DotMatrixBase
      {...props}
      cycleDurationMs={CYCLE_DURATION_MS}
      frameOpacities={FRAME_OPACITIES}
      idleOpacities={IDLE_OPACITIES}
    />
  );
}

function buildRowCyclePath(): number[] {
  const path: number[] = [];
  const push = (row: number, column: number) => path.push(rowMajorIndex(row, column));

  for (let row = 4; row >= 0; row -= 1) push(row, 0);
  push(0, 1);
  push(0, 2);
  for (let row = 1; row <= 4; row += 1) push(row, 2);
  push(4, 1);
  for (let row = 3; row >= 0; row -= 1) push(row, 1);
  push(0, 2);
  push(0, 3);
  for (let row = 1; row <= 4; row += 1) push(row, 3);
  push(4, 2);
  for (let row = 3; row >= 0; row -= 1) push(row, 2);
  push(0, 3);
  push(0, 4);
  for (let row = 1; row <= 4; row += 1) push(row, 4);

  return path;
}

function buildFrameOpacities(): number[] {
  const visitsByIndex = Array.from({ length: DOT_MATRIX_CELL_COUNT }, () => [] as number[]);

  ROW_CYCLE_PATH.forEach((index, step) => visitsByIndex[index]?.push(step));

  return Array.from({ length: STEP_COUNT * DOT_MATRIX_CELL_COUNT }, (_, flatIndex) => {
    const step = Math.floor(flatIndex / DOT_MATRIX_CELL_COUNT);
    const cellIndex = flatIndex % DOT_MATRIX_CELL_COUNT;
    let opacity = BASE_OPACITY;

    for (const visit of visitsByIndex[cellIndex] ?? []) {
      const distance = (step - visit + STEP_COUNT) % STEP_COUNT;
      if (distance < SNAKE_TAIL.length) {
        opacity = Math.max(opacity, SNAKE_TAIL[distance] ?? BASE_OPACITY);
      }
    }

    return opacity;
  });
}
