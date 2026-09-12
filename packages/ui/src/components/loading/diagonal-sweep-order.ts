/**
 * Computes a traversal order for cells in a square grid that sweeps across
 * alternating anti-diagonals (top-left to bottom-right), producing a
 * snake-like path. Direction flips every diagonal so consecutive cells in
 * the returned order stay adjacent instead of jumping across the grid.
 *
 * Returns an array where `result[cellIndex]` is that cell's position (0..n-1)
 * along the sweep, with `cellIndex = row * gridSize + col`.
 */
export function buildDiagonalSweepOrder(gridSize: number): number[] {
  const order = new Array<number>(gridSize * gridSize);
  const maxDiagonal = (gridSize - 1) * 2;
  let sequence = 0;

  for (let diagonal = 0; diagonal <= maxDiagonal; diagonal++) {
    const rows: number[] = [];
    for (let row = 0; row < gridSize; row++) {
      const col = diagonal - row;
      if (col >= 0 && col < gridSize) {
        rows.push(row);
      }
    }
    if (diagonal % 2 === 1) {
      rows.reverse();
    }
    for (const row of rows) {
      const col = diagonal - row;
      order[row * gridSize + col] = sequence;
      sequence++;
    }
  }

  return order;
}
