const SIDEBAR_BRANCH_STEP = 12;

/** Real tree coordinates; the viewport owns the common horizontal offset. */
export function getSidebarBranchLayout(
  depth: number,
  ancestors: readonly { continues: boolean }[] = [],
) {
  return {
    indentation: depth * SIDEBAR_BRANCH_STEP,
    parentIndentation: Math.max(0, depth - 1) * SIDEBAR_BRANCH_STEP,
    ancestorIndentations: ancestors.flatMap((ancestor, index) =>
      ancestor.continues ? [index * SIDEBAR_BRANCH_STEP] : [],
    ),
  };
}

export type SidebarBranchRowLayout = { top: number; height: number; depth: number };

/** Follow the first visible row, interpolating only while it crosses the viewport's top edge. */
export function getSidebarBranchOffset(
  rows: readonly SidebarBranchRowLayout[],
  visibleTop: number,
) {
  'worklet';
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (rows[middle]!.top <= visibleTop) low = middle + 1;
    else high = middle;
  }
  const row = rows[low - 1];
  if (!row || row.height <= 0 || visibleTop >= row.top + row.height) return 0;
  const next = rows[low];
  // Headers and gaps are outside the tree. Return to the ordinary left gutter there.
  const nextDepth = next && Math.abs(next.top - row.top - row.height) < 1 ? next.depth : 0;
  const progress = (visibleTop - row.top) / row.height;
  return (row.depth + (nextDepth - row.depth) * progress) * SIDEBAR_BRANCH_STEP;
}
