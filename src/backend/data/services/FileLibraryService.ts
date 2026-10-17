import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import type { Database, DbService } from '@/backend/data/db/DbService';
import {
  agentSessionTable,
  fileEntryTable,
  fileFolderTable,
  libraryFileTable,
  type FileFolderRow,
  type LibraryFileRow,
} from '@/backend/data/db/schemas';
import { createOrderedUuid } from '@/backend/data/db/schemas/_columnHelpers';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { TrashItem, TrashKind } from '@/shared/data/api/schemas/trash';
import type { CursorPaginationResponse } from '@/shared/data/api/types';
import type { FileEntry } from '@/shared/data/types/file';
import {
  FileFolderSchema,
  fileNameKey,
  workspacePathSegments,
  type FileFolder,
  type LibraryFile,
} from '@/shared/data/types/fileLibrary';

import { FileEntryService, rowToFileEntry } from './FileEntryService';
import {
  availableLibraryName,
  requireActiveFolder,
  requireWorkspaceDestination,
} from './utils/fileLibraryRows';
import { asNumericKey, decodeListCursor, encodeCursor, keysetOrdering } from './utils/keysetCursor';

export class FileLibraryService {
  constructor(private readonly hostDbService?: DbService) {}

  private get dbService() {
    return this.hostDbService ?? application.get('DbService');
  }
  private get db() {
    return this.dbService.getDb();
  }

  async folders(): Promise<FileFolder[]> {
    return (
      await this.db
        .select()
        .from(fileFolderTable)
        .where(isNull(fileFolderTable.deletedAt))
        .orderBy(fileFolderTable.nameKey)
    ).map(folderView);
  }

  async folder(id: string): Promise<FileFolder | null> {
    const [row] = await this.db.select().from(fileFolderTable).where(eq(fileFolderTable.id, id));
    return row ? folderView(row) : null;
  }

  async list(
    query: {
      folderId?: string | null;
      workspaceId?: string;
      cursor?: string;
      limit?: number;
      search?: string;
    } = {},
  ): Promise<CursorPaginationResponse<LibraryFile>> {
    const limit = Math.min(Math.max(query.limit ?? 30, 1), 100);
    const cursor = decodeListCursor(query.cursor, asNumericKey, 'library-files');
    const ordering = keysetOrdering(libraryFileTable.updatedAt, libraryFileTable.id, {
      major: 'desc',
      tie: 'desc',
    });
    if (query.folderId) await requireActiveFolder(this.db, query.folderId);
    if (query.workspaceId) await requireActiveFolder(this.db, query.workspaceId);
    const workspaceFolders = query.workspaceId
      ? await this.descendants(this.db, query.workspaceId, true)
      : undefined;
    const rows = await this.db
      .select({
        file: libraryFileTable,
        entry: fileEntryTable,
        versionCount: sql<number>`(SELECT count(*) FROM file_entry AS versions WHERE versions.library_file_id = ${libraryFileTable.id} AND versions.deleted_at IS NULL)`,
      })
      .from(libraryFileTable)
      .innerJoin(fileEntryTable, eq(libraryFileTable.currentEntryId, fileEntryTable.id))
      .where(
        and(
          isNull(libraryFileTable.deletedAt),
          isNull(fileEntryTable.deletedAt),
          workspaceFolders ? inArray(libraryFileTable.folderId, workspaceFolders) : undefined,
          query.search !== undefined
            ? sql`${libraryFileTable.name} LIKE ${`%${query.search.replace(/[\\%_]/g, '\\$&')}%`} ESCAPE '\\'`
            : query.folderId === undefined
              ? undefined
              : query.folderId
                ? eq(libraryFileTable.folderId, query.folderId)
                : isNull(libraryFileTable.folderId),
          cursor ? ordering.where(cursor) : undefined,
        ),
      )
      .orderBy(...ordering.orderBy)
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const tail = page.at(-1)?.file;
    return {
      items: page.map(({ file, entry, versionCount }) => ({
        id: file.id,
        folderId: file.folderId,
        name: file.name,
        entry: rowToFileEntry(entry),
        versionCount,
      })),
      ...(rows.length > limit && tail ? { nextCursor: encodeCursor(tail.updatedAt, tail.id) } : {}),
    };
  }

  async fileForEntry(id: string): Promise<LibraryFileRow | null> {
    const [row] = await this.db
      .select({ file: libraryFileTable })
      .from(fileEntryTable)
      .innerJoin(libraryFileTable, eq(fileEntryTable.libraryFileId, libraryFileTable.id))
      .where(
        and(
          eq(fileEntryTable.id, id),
          isNull(fileEntryTable.deletedAt),
          isNull(libraryFileTable.deletedAt),
        ),
      );
    return row?.file ?? null;
  }

  async history(id: string): Promise<FileEntry[]> {
    const file = await this.requireFile(this.db, id);
    await requireActiveFolder(this.db, file.folderId);
    return (
      await this.db
        .select()
        .from(fileEntryTable)
        .where(and(eq(fileEntryTable.libraryFileId, id), isNull(fileEntryTable.deletedAt)))
        .orderBy(
          desc(sql`${fileEntryTable.id} = ${file.currentEntryId}`),
          desc(fileEntryTable.createdAt),
          desc(fileEntryTable.id),
        )
    ).map(rowToFileEntry);
  }

  createFolder(
    parentId: string | null,
    requestedName: string,
    workspaceFolderId?: string,
  ): Promise<FileFolder> {
    return this.mutate(async (tx) => {
      await requireWorkspaceDestination(tx, parentId, workspaceFolderId);
      const name = await availableLibraryName(tx, parentId, requestedName);
      const [row] = await tx
        .insert(fileFolderTable)
        .values({ parentId, name, nameKey: fileNameKey(name) })
        .returning();
      if (!row) throw new Error('Insert did not return a FileFolder');
      return folderView(row);
    });
  }

  updateFolder(id: string, changes: { name?: string; parentId?: string | null }): Promise<void> {
    return this.mutate(async (tx) => {
      const [folder] = await tx
        .select()
        .from(fileFolderTable)
        .where(and(eq(fileFolderTable.id, id), isNull(fileFolderTable.deletedAt)));
      if (!folder) throw DataApiErrorFactory.notFound('FileFolder', id);
      const parentId = changes.parentId === undefined ? folder.parentId : changes.parentId;
      const descendants = await this.descendants(tx, id);
      if (parentId && descendants.includes(parentId))
        throw DataApiErrorFactory.conflict('A folder cannot be moved into itself or a descendant.');
      const name = await availableLibraryName(tx, parentId, changes.name ?? folder.name, {
        excludeId: id,
        suffix: changes.parentId !== undefined,
      });
      await tx
        .update(fileFolderTable)
        .set({ parentId, name, nameKey: fileNameKey(name) })
        .where(eq(fileFolderTable.id, id));
    });
  }

  updateFile(id: string, changes: { name?: string; folderId?: string | null }): Promise<void> {
    return this.mutate(async (tx) => {
      const file = await this.requireFile(tx, id);
      const folderId = changes.folderId === undefined ? file.folderId : changes.folderId;
      const name = await availableLibraryName(tx, folderId, changes.name ?? file.name, {
        excludeId: id,
        suffix: changes.folderId !== undefined,
        allowRootDuplicates: true,
      });
      await tx
        .update(libraryFileTable)
        .set({ folderId, name, nameKey: fileNameKey(name) })
        .where(eq(libraryFileTable.id, id));
    });
  }

  async workspace(sessionId: string): Promise<FileFolder | null> {
    const folder = await this.workspaceBinding(sessionId);
    if (folder) await requireActiveFolder(this.db, folder.id);
    return folder;
  }

  async workspaceBinding(sessionId: string): Promise<FileFolder | null> {
    const [session] = await this.db
      .select({ folderId: agentSessionTable.workspaceFolderId })
      .from(agentSessionTable)
      .where(eq(agentSessionTable.id, sessionId));
    if (!session?.folderId) return null;
    return this.folder(session.folderId);
  }

  async bindWorkspace(sessionId: string, folderId: string | null): Promise<FileFolder | null> {
    await this.mutate(async (tx) => {
      await requireActiveFolder(tx, folderId);
      const rows = await tx
        .update(agentSessionTable)
        .set({ workspaceFolderId: folderId })
        .where(eq(agentSessionTable.id, sessionId))
        .returning({ id: agentSessionTable.id });
      if (!rows.length) throw DataApiErrorFactory.notFound('AgentSession', sessionId);
    });
    publishDataApiChanges([`/agent-sessions/${sessionId}`]);
    return folderId ? this.folder(folderId) : null;
  }

  async contains(folderId: string, entryId: string): Promise<boolean> {
    const file = await this.fileForEntry(entryId);
    if (!file?.folderId) return false;
    await requireActiveFolder(this.db, folderId);
    return (await this.descendants(this.db, folderId, true)).includes(file.folderId);
  }

  async resolveDirectory(workspaceId: string, path: string): Promise<FileFolder> {
    await requireActiveFolder(this.db, workspaceId);
    let folder = (await this.folder(workspaceId))!;
    for (const name of workspacePathSegments(path)) {
      const [child] = await this.db
        .select()
        .from(fileFolderTable)
        .where(
          and(
            eq(fileFolderTable.parentId, folder.id),
            eq(fileFolderTable.nameKey, fileNameKey(name)),
            isNull(fileFolderTable.deletedAt),
          ),
        );
      if (!child) throw DataApiErrorFactory.notFound('FileFolder', path);
      folder = folderView(child);
    }
    return folder;
  }

  async resolvePath(
    workspaceId: string,
    path: string,
  ): Promise<{ folderId: string; name: string; file: LibraryFileRow | null }> {
    const segments = workspacePathSegments(path);
    const name = segments.pop();
    if (!name)
      throw DataApiErrorFactory.invalidOperation('resolvePath', 'A file path is required.');
    const folder = await this.resolveDirectory(workspaceId, segments.join('/'));
    const [file] = await this.db
      .select()
      .from(libraryFileTable)
      .where(
        and(
          eq(libraryFileTable.folderId, folder.id),
          eq(libraryFileTable.nameKey, fileNameKey(name)),
          isNull(libraryFileTable.deletedAt),
        ),
      );
    return { folderId: folder.id, name, file: file ?? null };
  }

  trashFileEntry(entryId: string, versionOnly = false): Promise<string[]> {
    return this.mutate(async (tx) => {
      const [entry] = await tx
        .select()
        .from(fileEntryTable)
        .where(and(eq(fileEntryTable.id, entryId), isNull(fileEntryTable.deletedAt)));
      if (!entry?.libraryFileId) throw DataApiErrorFactory.notFound('FileEntry', entryId);
      const file = await this.requireFile(tx, entry.libraryFileId);
      const deletedAt = Date.now();
      if (versionOnly && file.currentEntryId === entry.id)
        throw DataApiErrorFactory.invalidOperation(
          'trashVersion',
          'Delete the whole file to remove its current version.',
        );
      if (!versionOnly)
        await tx
          .update(libraryFileTable)
          .set({ deletedAt, trashedWith: null, updatedAt: sql`${libraryFileTable.updatedAt}` })
          .where(eq(libraryFileTable.id, file.id));
      const rows = await tx
        .update(fileEntryTable)
        .set({
          deletedAt,
          trashedWith: versionOnly ? null : file.id,
          updatedAt: sql`${fileEntryTable.updatedAt}`,
        })
        .where(
          versionOnly ? eq(fileEntryTable.id, entryId) : eq(fileEntryTable.libraryFileId, file.id),
        )
        .returning({ id: fileEntryTable.id });
      return rows.map((row) => row.id);
    });
  }

  trashFolder(id: string): Promise<string[]> {
    return this.mutate(async (tx) => {
      await requireActiveFolder(tx, id);
      const ids = await this.descendants(tx, id, true);
      const deletedAt = Date.now();
      for (const folderId of ids)
        await tx
          .update(fileFolderTable)
          .set({
            deletedAt,
            trashedWith: folderId === id ? null : id,
            updatedAt: sql`${fileFolderTable.updatedAt}`,
          })
          .where(eq(fileFolderTable.id, folderId));
      const files = await tx
        .update(libraryFileTable)
        .set({ deletedAt, trashedWith: id, updatedAt: sql`${libraryFileTable.updatedAt}` })
        .where(and(inArray(libraryFileTable.folderId, ids), isNull(libraryFileTable.deletedAt)))
        .returning({ id: libraryFileTable.id });
      if (!files.length) return [];
      const entries = await tx
        .update(fileEntryTable)
        .set({ deletedAt, trashedWith: id, updatedAt: sql`${fileEntryTable.updatedAt}` })
        .where(
          inArray(
            fileEntryTable.libraryFileId,
            files.map((file) => file.id),
          ),
        )
        .returning({ id: fileEntryTable.id });
      return entries.map((entry) => entry.id);
    });
  }

  restore(kind: TrashKind, id: string): Promise<string[]> {
    return this.mutate(async (tx) => {
      if (kind === 'folder') {
        const [folder] = await tx.select().from(fileFolderTable).where(eq(fileFolderTable.id, id));
        if (!folder || folder.deletedAt === null || folder.trashedWith !== null)
          throw DataApiErrorFactory.notFound('TrashItem', id);
        const parentId = await this.restoreParent(tx, folder.parentId);
        const name = await availableLibraryName(tx, parentId, folder.name, {
          suffix: true,
          excludeId: id,
        });
        await tx
          .update(fileFolderTable)
          .set({
            parentId,
            name,
            nameKey: fileNameKey(name),
            deletedAt: null,
            trashedWith: null,
            updatedAt: sql`${fileFolderTable.updatedAt}`,
          })
          .where(eq(fileFolderTable.id, id));
        await tx
          .update(fileFolderTable)
          .set({ deletedAt: null, trashedWith: null, updatedAt: sql`${fileFolderTable.updatedAt}` })
          .where(eq(fileFolderTable.trashedWith, id));
        await tx
          .update(libraryFileTable)
          .set({
            deletedAt: null,
            trashedWith: null,
            updatedAt: sql`${libraryFileTable.updatedAt}`,
          })
          .where(eq(libraryFileTable.trashedWith, id));
      } else if (kind === 'file') {
        const [file] = await tx.select().from(libraryFileTable).where(eq(libraryFileTable.id, id));
        if (!file || file.deletedAt === null || file.trashedWith !== null)
          throw DataApiErrorFactory.notFound('TrashItem', id);
        const folderId = await this.restoreParent(tx, file.folderId);
        const name = await availableLibraryName(tx, folderId, file.name, {
          suffix: true,
          excludeId: id,
        });
        await tx
          .update(libraryFileTable)
          .set({
            folderId,
            name,
            nameKey: fileNameKey(name),
            deletedAt: null,
            trashedWith: null,
            updatedAt: sql`${libraryFileTable.updatedAt}`,
          })
          .where(eq(libraryFileTable.id, id));
      } else {
        const [entry] = await tx.select().from(fileEntryTable).where(eq(fileEntryTable.id, id));
        if (!entry || entry.deletedAt === null || entry.trashedWith !== null)
          throw DataApiErrorFactory.notFound('TrashItem', id);
        const [file] = entry.libraryFileId
          ? await tx
              .select()
              .from(libraryFileTable)
              .where(eq(libraryFileTable.id, entry.libraryFileId))
          : [];
        if (!file || file.deletedAt !== null) {
          const fileId = createOrderedUuid();
          const name = await availableLibraryName(tx, null, entry.filename, { suffix: true });
          await tx.insert(libraryFileTable).values({
            id: fileId,
            folderId: null,
            name,
            nameKey: fileNameKey(name),
            currentEntryId: entry.id,
          });
          await tx
            .update(fileEntryTable)
            .set({ libraryFileId: fileId, updatedAt: sql`${fileEntryTable.updatedAt}` })
            .where(eq(fileEntryTable.id, id));
        }
      }
      const entries = await tx
        .update(fileEntryTable)
        .set({ deletedAt: null, trashedWith: null, updatedAt: sql`${fileEntryTable.updatedAt}` })
        .where(kind === 'version' ? eq(fileEntryTable.id, id) : eq(fileEntryTable.trashedWith, id))
        .returning({ id: fileEntryTable.id });
      return entries.map((entry) => entry.id);
    });
  }

  /** Remove group ownership atomically, then return its blobs for best-effort cleanup. */
  purge(item: TrashItem): Promise<FileEntry[] | null> {
    return this.mutate(async (tx) => {
      const entries = new FileEntryService(this.dbService);
      if (item.kind === 'version') {
        const [row] = await tx
          .select()
          .from(fileEntryTable)
          .where(
            and(
              eq(fileEntryTable.id, item.id),
              eq(fileEntryTable.deletedAt, item.deletedAt),
              isNull(fileEntryTable.trashedWith),
            ),
          );
        if (!row) return null;
        await entries.deleteTx(tx, row.id);
        return [rowToFileEntry(row)];
      }
      let fileIds: string[];
      if (item.kind === 'folder') {
        const [folder] = await tx
          .select()
          .from(fileFolderTable)
          .where(
            and(
              eq(fileFolderTable.id, item.id),
              eq(fileFolderTable.deletedAt, item.deletedAt),
              isNull(fileFolderTable.trashedWith),
            ),
          );
        if (!folder) return null;
        fileIds = (
          await tx
            .select({ id: libraryFileTable.id })
            .from(libraryFileTable)
            .where(eq(libraryFileTable.trashedWith, item.id))
        ).map((file) => file.id);
      } else {
        const [file] = await tx
          .select()
          .from(libraryFileTable)
          .where(
            and(
              eq(libraryFileTable.id, item.id),
              eq(libraryFileTable.deletedAt, item.deletedAt),
              isNull(libraryFileTable.trashedWith),
            ),
          );
        if (!file) return null;
        fileIds = [file.id];
      }
      const rows = fileIds.length
        ? await tx
            .select()
            .from(fileEntryTable)
            .where(inArray(fileEntryTable.libraryFileId, fileIds))
        : [];
      for (const row of rows) await entries.deleteTx(tx, row.id);
      if (fileIds.length)
        await tx.delete(libraryFileTable).where(inArray(libraryFileTable.id, fileIds));
      if (item.kind === 'folder')
        await tx
          .delete(fileFolderTable)
          .where(or(eq(fileFolderTable.id, item.id), eq(fileFolderTable.trashedWith, item.id)));
      return rows.map(rowToFileEntry);
    });
  }

  private async restoreParent(tx: Database, id: string | null): Promise<string | null> {
    if (!id) return null;
    const [folder] = await tx.select().from(fileFolderTable).where(eq(fileFolderTable.id, id));
    if (!folder || folder.deletedAt !== null) return null;
    await requireActiveFolder(tx, id);
    return id;
  }

  private async requireFile(tx: Database, id: string): Promise<LibraryFileRow> {
    const [file] = await tx
      .select()
      .from(libraryFileTable)
      .where(and(eq(libraryFileTable.id, id), isNull(libraryFileTable.deletedAt)));
    if (!file) throw DataApiErrorFactory.notFound('LibraryFile', id);
    return file;
  }

  private async descendants(tx: Database, id: string, activeOnly = false): Promise<string[]> {
    const folders = await tx
      .select()
      .from(fileFolderTable)
      .where(activeOnly ? isNull(fileFolderTable.deletedAt) : undefined);
    const ids = new Set([id]);
    for (let changed = true; changed;) {
      changed = false;
      for (const folder of folders)
        if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
          ids.add(folder.id);
          changed = true;
        }
    }
    return [...ids];
  }

  private async mutate<T>(operation: (tx: Database) => Promise<T>): Promise<T> {
    storageMutationGate.assertWritable();
    const result = await this.dbService.withWriteTx(async (tx) => {
      storageMutationGate.assertWritable();
      return operation(tx);
    });
    publishDataApiChanges([
      '/files/library',
      '/files/history',
      '/files/folders',
      '/files/workspace',
      '/files/entries',
      '/trash',
      '/trash/summary',
      '/agent-sessions',
    ]);
    return result;
  }
}

function folderView({
  nameKey: _nameKey,
  trashedWith: _trashedWith,
  ...row
}: FileFolderRow): FileFolder {
  return FileFolderSchema.parse(row);
}

export const fileLibraryService = new FileLibraryService();
