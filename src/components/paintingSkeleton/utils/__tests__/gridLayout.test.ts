import { paintingSkeleton } from '@/config/constants';

import { measurePaintingSkeletonGrid } from '../gridLayout';

const { gap, maxCells } = paintingSkeleton;

describe('measurePaintingSkeletonGrid', () => {
  it('returns null while the box is unmeasured or smaller than the padding', () => {
    expect(measurePaintingSkeletonGrid(0, 0)).toBeNull();
    expect(measurePaintingSkeletonGrid(10, 300)).toBeNull();
    expect(measurePaintingSkeletonGrid(300, 10)).toBeNull();
  });

  it('divides a medium box by the base pitch', () => {
    // inner 380×280, pitch 38 → 10×7 cells stretched onto the tracks.
    const grid = measurePaintingSkeletonGrid(390, 290);

    expect(grid).toEqual({
      cols: 10,
      rows: 7,
      cellWidth: (380 - 9 * gap) / 10,
      cellHeight: (280 - 6 * gap) / 7,
      innerWidth: 380,
      innerHeight: 280,
    });
  });

  it('grows the pitch to keep large boxes under the cell cap', () => {
    // inner 790×590 would be 20×15=300 cells at pitch 38; the pitch walks up
    // in steps of 2 until 48 (16×12=192 still over) … 54 → 14×10=140 … 62 →
    // 12×9=108 … 64 → 12×9 … 66 → 11×8=88 ≤ 100.
    const grid = measurePaintingSkeletonGrid(800, 600);

    expect(grid).not.toBeNull();
    expect(grid!.cols * grid!.rows).toBeLessThanOrEqual(maxCells);
    expect(grid!.cols).toBe(Math.floor(790 / 66));
    expect(grid!.rows).toBe(Math.floor(590 / 66));
  });

  it('clamps to a single cell when the inner box is smaller than the pitch', () => {
    const grid = measurePaintingSkeletonGrid(30, 30);

    expect(grid).toEqual({
      cols: 1,
      rows: 1,
      cellWidth: 20,
      cellHeight: 20,
      innerWidth: 20,
      innerHeight: 20,
    });
  });

  it('tiles the inner box exactly: cells plus gaps reconstruct the inner size', () => {
    for (const [width, height] of [
      [390, 290],
      [342, 256],
      [800, 600],
      [1200, 200],
    ]) {
      const grid = measurePaintingSkeletonGrid(width, height);

      expect(grid).not.toBeNull();
      expect(grid!.cols * grid!.cellWidth + (grid!.cols - 1) * gap).toBeCloseTo(grid!.innerWidth);
      expect(grid!.rows * grid!.cellHeight + (grid!.rows - 1) * gap).toBeCloseTo(grid!.innerHeight);
    }
  });
});
