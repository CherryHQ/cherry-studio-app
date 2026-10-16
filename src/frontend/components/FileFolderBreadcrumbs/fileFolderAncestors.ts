import type { FileFolder } from '@/shared/data/types/fileLibrary';

export function fileFolderAncestors(
  folderId: string | null,
  folders: ReadonlyMap<string, FileFolder>,
): FileFolder[] {
  const ancestors: FileFolder[] = [];
  let current = folderId ? folders.get(folderId) : undefined;
  while (current && !ancestors.includes(current)) {
    ancestors.unshift(current);
    current = current.parentId ? folders.get(current.parentId) : undefined;
  }
  return ancestors;
}
