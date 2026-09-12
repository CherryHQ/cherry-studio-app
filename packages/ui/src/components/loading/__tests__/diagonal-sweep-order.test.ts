import { buildDiagonalSweepOrder } from '../diagonal-sweep-order';

describe('buildDiagonalSweepOrder', () => {
  it('returns a permutation of 0..n-1 for a 5x5 grid', () => {
    const order = buildDiagonalSweepOrder(5);

    expect(order).toHaveLength(25);
    expect([...order].sort((a, b) => a - b)).toEqual([...Array(25).keys()]);
  });

  it('starts at the top-left corner and ends at the bottom-right corner', () => {
    const gridSize = 5;
    const order = buildDiagonalSweepOrder(gridSize);

    expect(order[0]).toBe(0);
    expect(order[gridSize * gridSize - 1]).toBe(gridSize * gridSize - 1);
  });

  it('keeps each anti-diagonal contiguous and alternates traversal direction', () => {
    const gridSize = 5;
    const order = buildDiagonalSweepOrder(gridSize);
    const cellOrder = (row: number, col: number) => order[row * gridSize + col];

    // Diagonal 2 (row + col = 2, even) walks row ascending: (0,2) -> (1,1) -> (2,0).
    expect(cellOrder(0, 2)).toBeLessThan(cellOrder(1, 1));
    expect(cellOrder(1, 1)).toBeLessThan(cellOrder(2, 0));

    // Diagonal 3 (row + col = 3, odd) walks row descending: (3,0) -> (2,1) -> (1,2) -> (0,3).
    expect(cellOrder(3, 0)).toBeLessThan(cellOrder(2, 1));
    expect(cellOrder(2, 1)).toBeLessThan(cellOrder(1, 2));
    expect(cellOrder(1, 2)).toBeLessThan(cellOrder(0, 3));
  });
});
