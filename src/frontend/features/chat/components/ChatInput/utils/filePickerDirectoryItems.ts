import type { ResolvedFileEntry } from '@/frontend/hooks/file';
import type { FileFolder } from '@/shared/data/types/fileLibrary';

export type FilePickerDirectoryItem =
  | { kind: 'folder'; folder: FileFolder }
  | { kind: 'file'; file: ResolvedFileEntry };

export function filePickerModifiedAt(file: ResolvedFileEntry) {
  return file.libraryFile?.updatedAt ?? file.entry.updatedAt;
}

export function filePickerItemKey(item: FilePickerDirectoryItem) {
  return item.kind === 'folder' ? `folder:${item.folder.id}` : `file:${item.file.entry.id}`;
}

/** Merge one level without letting old folders jump ahead of files on an unloaded page. */
export function filePickerDirectoryItems({
  entries,
  folders,
  folderId,
  isComplete,
}: {
  entries: readonly ResolvedFileEntry[];
  folders: readonly FileFolder[];
  folderId: string | null;
  isComplete: boolean;
}): FilePickerDirectoryItem[] {
  const loadedThrough = entries.reduce(
    (oldest, file) => Math.min(oldest, filePickerModifiedAt(file)),
    Infinity,
  );
  const items: FilePickerDirectoryItem[] = [
    ...folders
      .filter(
        (folder) =>
          folder.parentId === folderId && (isComplete || folder.updatedAt > loadedThrough),
      )
      .map((folder) => ({ kind: 'folder' as const, folder })),
    ...entries.map((file) => ({ kind: 'file' as const, file })),
  ];
  return items.sort((a, b) => {
    const aTime = a.kind === 'folder' ? a.folder.updatedAt : filePickerModifiedAt(a.file);
    const bTime = b.kind === 'folder' ? b.folder.updatedAt : filePickerModifiedAt(b.file);
    const aId = a.kind === 'folder' ? a.folder.id : (a.file.libraryFile?.id ?? a.file.entry.id);
    const bId = b.kind === 'folder' ? b.folder.id : (b.file.libraryFile?.id ?? b.file.entry.id);
    return bTime - aTime || bId.localeCompare(aId);
  });
}
