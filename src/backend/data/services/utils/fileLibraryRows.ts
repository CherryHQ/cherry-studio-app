import { and, eq, isNull } from 'drizzle-orm';

import type { Database } from '@/backend/data/db/DbService';
import { fileEntryTable, fileFolderTable, libraryFileTable } from '@/backend/data/db/schemas';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import { filenameExtension, SafeNameSchema } from '@/shared/data/types/file';
import { fileNameKey, type FilePlacement } from '@/shared/data/types/fileLibrary';

export async function requireActiveFolder(db: Database, id: string | null): Promise<void> {
  const visited = new Set<string>();
  let current = id;
  while (current !== null) {
    if (visited.has(current))
      throw DataApiErrorFactory.conflict('Folder ancestry contains a cycle.');
    visited.add(current);
    const [folder] = await db.select().from(fileFolderTable).where(eq(fileFolderTable.id, current));
    if (!folder || folder.deletedAt !== null)
      throw DataApiErrorFactory.notFound('FileFolder', current);
    current = folder.parentId;
  }
}

export async function requireWorkspaceDestination(
  db: Database,
  folderId: string | null,
  workspaceFolderId: string | null | undefined,
) {
  await requireActiveFolder(db, folderId);
  if (workspaceFolderId === undefined) return;
  if (workspaceFolderId === null && folderId === null) return;
  let current = folderId;
  while (current) {
    if (current === workspaceFolderId) return;
    const [folder] = await db
      .select({ parentId: fileFolderTable.parentId })
      .from(fileFolderTable)
      .where(eq(fileFolderTable.id, current));
    current = folder?.parentId ?? null;
  }
  throw DataApiErrorFactory.conflict("The destination moved outside this turn's workspace.");
}

export async function availableLibraryName(
  db: Database,
  folderId: string | null,
  requestedName: string,
  options: { excludeId?: string; suffix?: boolean; allowRootDuplicates?: boolean } = {},
): Promise<string> {
  const name = SafeNameSchema.parse(requestedName.normalize('NFC').trim());
  await requireActiveFolder(db, folderId);
  if (folderId === null && options.allowRootDuplicates) return name;
  const folders = await db
    .select({ id: fileFolderTable.id, name: fileFolderTable.name })
    .from(fileFolderTable)
    .where(
      and(
        folderId === null
          ? isNull(fileFolderTable.parentId)
          : eq(fileFolderTable.parentId, folderId),
        isNull(fileFolderTable.deletedAt),
      ),
    );
  const files = await db
    .select({ id: libraryFileTable.id, name: libraryFileTable.name })
    .from(libraryFileTable)
    .where(
      and(
        folderId === null
          ? isNull(libraryFileTable.folderId)
          : eq(libraryFileTable.folderId, folderId),
        isNull(libraryFileTable.deletedAt),
      ),
    );
  const names = new Set(
    [...folders, ...files]
      .filter((item) => item.id !== options.excludeId)
      .map((item) => fileNameKey(item.name)),
  );
  if (!names.has(fileNameKey(name))) return name;
  if (!options.suffix)
    throw DataApiErrorFactory.conflict('A file or folder already has that name.');
  const extension = filenameExtension(name);
  const stem = extension ? name.slice(0, -(extension.length + 1)) : name;
  for (let ordinal = 2; ; ordinal += 1) {
    const tail = ` (${ordinal})${extension ? `.${extension}` : ''}`;
    const candidate = `${stem.slice(0, 255 - tail.length)}${tail}`;
    if (!names.has(fileNameKey(candidate))) return candidate;
  }
}

/** Runs before the version insert in the same serialized transaction. */
export async function placeLibraryVersion(
  tx: Database,
  entry: { id: string; filename: string },
  placement: FilePlacement,
): Promise<string> {
  if (placement.baseFileEntryId) {
    const [source] = await tx
      .select()
      .from(fileEntryTable)
      .where(
        and(eq(fileEntryTable.id, placement.baseFileEntryId), isNull(fileEntryTable.deletedAt)),
      );
    if (!source?.libraryFileId)
      throw DataApiErrorFactory.notFound('FileEntry', placement.baseFileEntryId);
    const [file] = await tx
      .select()
      .from(libraryFileTable)
      .where(
        and(eq(libraryFileTable.id, source.libraryFileId), isNull(libraryFileTable.deletedAt)),
      );
    if (!file) throw DataApiErrorFactory.notFound('LibraryFile', source.libraryFileId);
    await requireWorkspaceDestination(tx, file.folderId, placement.workspaceFolderId);
    if (file.currentEntryId !== source.id)
      throw DataApiErrorFactory.conflict(
        'The file has a newer version. Read it again before editing.',
      );
    if (placement.baseUpdatedAt !== undefined && source.updatedAt !== placement.baseUpdatedAt)
      throw DataApiErrorFactory.conflict(
        'The draft changed after it was read. Read it again before editing.',
      );
    if (
      placement.expectedName !== undefined &&
      file.nameKey !== fileNameKey(placement.expectedName)
    )
      throw DataApiErrorFactory.conflict('The file was renamed. Read its path again.');
    if (placement.folderId !== undefined && placement.folderId !== file.folderId)
      throw DataApiErrorFactory.conflict('The file moved to another folder. Read its path again.');
    await tx
      .update(libraryFileTable)
      .set({ currentEntryId: entry.id })
      .where(eq(libraryFileTable.id, file.id));
    return file.id;
  }
  const folderId = placement.folderId ?? null;
  await requireWorkspaceDestination(tx, folderId, placement.workspaceFolderId);
  const name = await availableLibraryName(tx, folderId, entry.filename, {
    suffix: !placement.conflictIfExists,
    allowRootDuplicates: !placement.conflictIfExists,
  });
  const [file] = await tx
    .insert(libraryFileTable)
    .values({ id: entry.id, folderId, name, nameKey: fileNameKey(name), currentEntryId: entry.id })
    .returning();
  if (!file) throw new Error('Insert did not return a LibraryFile');
  return file.id;
}
