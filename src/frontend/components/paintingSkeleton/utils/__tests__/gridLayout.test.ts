import { paintingSkeleton } from '@/utils/constants';

import { measurePaintingSkeletonGrid } from '../gridLayout';

const { gap, maxCells } = paintingSkeleton;

describe('measurePaintingSkeletonGrid', () => {
  it('returns null while the box is unmeasured or smaller than the padding', () => {
    expect(measurePaintingSkeletonGrid(0, 0)).toBeNull();
    expect(measurePaintingSkeletonGrid(10, 300)).toBeNull();
    expect(measurePaintingSkeletonGrid(300, 10)).toBeNull();
  });

  it('grows the pitch until a medium box fits exactly 48 cells', () => {
    const grid = measurePaintingSkeletonGrid(390, 290);

    expect(grid).toEqual({
      cols: 8,
      rows: 6,
      cellWidth: (380 - 7 * gap) / 8,
      cellHeight: (280 - 5 * gap) / 6,
      innerWidth: 380,
      innerHeight: 280,
    });
  });

  it('uses a 6 by 6 grid for an approximately 300 square box', () => {
    const grid = measurePaintingSkeletonGrid(300, 300);

    expect(grid).toMatchObject({ cols: 6, rows: 6 });
  });

  it('grows the pitch to keep large boxes under the cell cap', () => {
    const grid = measurePaintingSkeletonGrid(800, 600);

    expect(grid).toMatchObject({ cols: 8, rows: 6 });
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
      expect(grid!.cols * grid!.rows).toBeLessThanOrEqual(maxCells);
      expect(grid!.cols * grid!.cellWidth + (grid!.cols - 1) * gap).toBeCloseTo(grid!.innerWidth);
      expect(grid!.rows * grid!.cellHeight + (grid!.rows - 1) * gap).toBeCloseTo(grid!.innerHeight);
    }
  });
});
