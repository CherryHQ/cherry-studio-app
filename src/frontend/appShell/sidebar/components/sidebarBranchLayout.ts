const BRANCH_STEP = 12;
const MAX_VISIBLE_BRANCH_DEPTH = 4;

/** Bound the gutter and coalesce deep ancestor rails without changing conversation relationships. */
export function getSidebarBranchLayout(
  depth: number,
  ancestors: readonly { continues: boolean }[] = [],
) {
  const ancestorIndentations = new Set<number>();
  for (const [index, ancestor] of ancestors.entries())
    if (ancestor.continues)
      ancestorIndentations.add(Math.min(index, MAX_VISIBLE_BRANCH_DEPTH) * BRANCH_STEP);
  return {
    indentation: Math.min(depth, MAX_VISIBLE_BRANCH_DEPTH) * BRANCH_STEP,
    parentIndentation: Math.min(Math.max(0, depth - 1), MAX_VISIBLE_BRANCH_DEPTH) * BRANCH_STEP,
    ancestorIndentations: [...ancestorIndentations],
  };
}
