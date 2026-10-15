import type { SQLiteDatabase } from 'expo-sqlite';

import { BackupError } from '@/shared/contracts/backup';
import { SafeNameSchema } from '@/shared/data/types/file';
import { fileNameKey } from '@/shared/data/types/fileLibrary';

type Folder = {
  id: string;
  parent_id: string | null;
  name: string;
  name_key: string;
  deleted_at: number | null;
  trashed_with: string | null;
};
type LogicalFile = {
  id: string;
  folder_id: string | null;
  name: string;
  name_key: string;
  current_entry_id: string;
  deleted_at: number | null;
  trashed_with: string | null;
};
type Version = {
  id: string;
  library_file_id: string | null;
  deleted_at: number | null;
  trashed_with: string | null;
};

/** Older archives gain the namespace through migration; new archives must already be coherent. */
export async function validateFileLibraryDatabase(db: SQLiteDatabase) {
  const table = await db.getFirstAsync(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'library_file'",
  );
  if (!table) return;
  const folders = await db.getAllAsync<Folder>('SELECT * FROM file_folder');
  const files = await db.getAllAsync<LogicalFile>('SELECT * FROM library_file');
  const versions = await db.getAllAsync<Version>(
    'SELECT id, library_file_id, deleted_at, trashed_with FROM file_entry',
  );
  validateFileLibraryReferences({ folders, files, versions });
}

export function validateFileLibraryReferences({
  folders,
  files,
  versions,
}: {
  folders: Folder[];
  files: LogicalFile[];
  versions: Version[];
}) {
  const byFolder = new Map(folders.map((folder) => [folder.id, folder]));
  const byFile = new Map(files.map((file) => [file.id, file]));
  const byVersion = new Map(versions.map((entry) => [entry.id, entry]));
  const fail = (): never => {
    throw new BackupError('invalid', 'Invalid file-library references.');
  };
  const names = new Set<string>();
  function checkName(
    parentId: string | null,
    name: string,
    nameKey: string,
    deleted: boolean,
    isFile = false,
  ) {
    if (!SafeNameSchema.safeParse(name).success) fail();
    if (isFile && parentId === null) return; // Flat-library names were never unique or normalized.
    if (fileNameKey(name) !== nameKey) fail();
    if (deleted) return;
    const key = `${parentId ?? ''}\0${nameKey}`;
    if (names.has(key)) fail();
    names.add(key);
  }
  function checkFolder(id: string | null, active: boolean) {
    const visited = new Set<string>();
    let current = id;
    while (current !== null) {
      if (visited.has(current)) fail();
      visited.add(current);
      const folder = byFolder.get(current);
      if (!folder || (active && folder.deleted_at !== null)) fail();
      current = folder.parent_id;
    }
  }
  function checkTrash(item: { deleted_at: number | null; trashed_with: string | null }) {
    if (item.trashed_with === null) return;
    const root = byFolder.get(item.trashed_with) ?? byFile.get(item.trashed_with);
    if (
      !root ||
      root.trashed_with !== null ||
      root.deleted_at === null ||
      root.deleted_at !== item.deleted_at
    )
      fail();
  }
  function hasAncestor(parentId: string | null, root: string): boolean {
    let current = parentId;
    while (current) {
      if (current === root) return true;
      current = byFolder.get(current)?.parent_id ?? null;
    }
    return false;
  }
  for (const folder of folders) {
    checkFolder(folder.id, folder.deleted_at === null);
    checkName(folder.parent_id, folder.name, folder.name_key, folder.deleted_at !== null);
    checkTrash(folder);
    if (folder.trashed_with && !hasAncestor(folder.parent_id, folder.trashed_with)) fail();
  }
  for (const file of files) {
    checkFolder(file.folder_id, file.deleted_at === null);
    checkName(file.folder_id, file.name, file.name_key, file.deleted_at !== null, true);
    checkTrash(file);
    if (file.trashed_with && !hasAncestor(file.folder_id, file.trashed_with)) fail();
    const current = byVersion.get(file.current_entry_id);
    if (
      !current ||
      current.library_file_id !== file.id ||
      (file.deleted_at === null && current.deleted_at !== null)
    )
      fail();
  }
  for (const entry of versions) {
    const file = entry.library_file_id ? byFile.get(entry.library_file_id) : undefined;
    if (!file || (file.deleted_at !== null && entry.deleted_at === null)) fail();
    checkTrash(entry);
    if (
      file.deleted_at === null
        ? entry.trashed_with !== null
        : entry.trashed_with !== (file.trashed_with ?? file.id)
    )
      fail();
  }
}
