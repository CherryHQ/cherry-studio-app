type MasonryItem = { aspectRatio: number };

export function distributeMasonryItems<TItem extends MasonryItem>(
  items: readonly TItem[],
): [TItem[], TItem[]] {
  const columns: [TItem[], TItem[]] = [[], []];
  const heights: [number, number] = [0, 0];

  for (const item of items) {
    const column = heights[0] <= heights[1] ? 0 : 1;
    columns[column].push(item);
    heights[column] += 1 / Math.max(item.aspectRatio, 0.01);
  }

  return columns;
}
