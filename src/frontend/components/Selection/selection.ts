export function toggleSelection(selectedIds: ReadonlySet<string>, id: string): Set<string> {
  const nextSelectedIds = new Set(selectedIds);

  if (nextSelectedIds.has(id)) {
    nextSelectedIds.delete(id);
  } else {
    nextSelectedIds.add(id);
  }

  return nextSelectedIds;
}

export function areAllSelected(
  selectedIds: ReadonlySet<string>,
  allIds: readonly string[],
): boolean {
  return allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
}

/** Source order wins over click order; keep unknown IDs so callers can report deletion. */
export function orderedSelection(
  selectedIds: ReadonlySet<string>,
  sourceIds: readonly string[],
): string[] {
  const positions = new Map(sourceIds.map((id, index) => [id, index]));
  return [...selectedIds].sort(
    (left, right) => (positions.get(left) ?? Infinity) - (positions.get(right) ?? Infinity),
  );
}
