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
