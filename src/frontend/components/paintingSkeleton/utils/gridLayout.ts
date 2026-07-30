import { paintingSkeleton } from '@/utils/constants';

type PaintingSkeletonGrid = {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  innerWidth: number;
  innerHeight: number;
};

/**
 * Desktop-parity grid measurement: divide the padded box by a pitch that grows
 * until the cell count fits under maxCells, then stretch the cells so the
 * tracks fill the inner box exactly (equal gutters on all four sides).
 * Returns null while the box is unmeasured or too small to hold a cell.
 */
export function measurePaintingSkeletonGrid(
  width: number,
  height: number,
): PaintingSkeletonGrid | null {
  const { gap, basePitch, pitchStep, maxCells } = paintingSkeleton;
  const innerWidth = width - gap * 2;
  const innerHeight = height - gap * 2;
  if (innerWidth <= 0 || innerHeight <= 0) {
    return null;
  }

  let pitch = basePitch;
  while (Math.floor(innerWidth / pitch) * Math.floor(innerHeight / pitch) > maxCells) {
    pitch += pitchStep;
  }
  const cols = Math.max(1, Math.floor(innerWidth / pitch));
  const rows = Math.max(1, Math.floor(innerHeight / pitch));

  return {
    cols,
    rows,
    cellWidth: (innerWidth - (cols - 1) * gap) / cols,
    cellHeight: (innerHeight - (rows - 1) * gap) / rows,
    innerWidth,
    innerHeight,
  };
}
