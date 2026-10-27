import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import * as z from 'zod';

import { application } from '@/backend/core/application/Application';
import type { Database, DbService } from '@/backend/data/db/DbService';
import { type FileEntryRow, fileEntryTable, libraryFileTable } from '@/backend/data/db/schemas';
import { monotonicUpdateTimestamp } from '@/backend/data/db/schemas/_columnHelpers';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { FileEntry, FileEntryId } from '@/shared/data/types/file';
import {
  FileEntryIdSchema,
  FileEntryProvenanceSchema,
  FileEntrySchema,
  MediaTypeSchema,
  SafeNameSchema,
} from '@/shared/data/types/file';

import { placeLibraryVersion, requireWorkspaceDestination } from './utils/fileLibraryRows';

const CreateFileEntrySchema = z.strictObject({
  filename: SafeNameSchema,
  id: FileEntryIdSchema,
  mediaType: MediaTypeSchema,
  // No default: every creation site states an origin, so a new one (a peer
  // transfer, a future import path) cannot silently inherit a wrong answer.
  provenance: FileEntryProvenanceSchema,
  size: z.int().nonnegative(),
  folderId: z.uuid().nullable().optional(),
  baseFileEntryId: z.uuid().optional(),
  conflictIfExists: z.boolean().optional(),
  workspaceFolderId: z.uuid().nullable().optional(),
  baseUpdatedAt: z.int().nonnegative().optional(),
  expectedName: SafeNameSchema.optional(),
});

export type CreateFileEntry = z.input<typeof CreateFileEntrySchema>;

export class FileEntryService {
  constructor(private readonly hostDbService?: DbService) {}

  /**
   * Ordinary singleton callers resolve the current host per call. A lifecycle-owned
   * workflow may instead inject its originating database so late cancellation
   * cannot redirect an old operation into a replacement host.
   */
  private get dbService() {
    return this.hostDbService ?? application.get('DbService');
  }

  private get db() {
    return this.dbService.getDb();
  }

  withWriteTx<TValue>(callback: (tx: Database) => Promise<TValue>): Promise<TValue> {
    return this.dbService.withWriteTx(callback);
  }

  async findById(id: FileEntryId): Promise<FileEntry | null> {
    return (await this.findAvailableByIds([id]))[0] ?? null;
  }

  findTrashedById(id: FileEntryId, deletedAt: number): Promise<FileEntry | null> {
    return this.findByIdTx(this.db, id, deletedAt);
  }

  /** `null` requires an active entry; a timestamp requires the same trash incarnation. */
  async findByIdTx(
    tx: Database,
    id: FileEntryId,
    deletedAt?: number | null,
  ): Promise<FileEntry | null> {
    const [row] = await tx
      .select()
      .from(fileEntryTable)
      .where(
        and(
          eq(fileEntryTable.id, id),
          deletedAt === undefined
            ? undefined
            : deletedAt === null
              ? isNull(fileEntryTable.deletedAt)
              : eq(fileEntryTable.deletedAt, deletedAt),
        ),
      )
      .limit(1);
    return row ? rowToFileEntry(row) : null;
  }

  /**
   * Batch lookup for submission-time owners. Soft-deleted rows are unavailable
   * while historical owners retain their file ids for restoration.
   */
  async findAvailableByIds(ids: readonly FileEntryId[]): Promise<FileEntry[]> {
    const uniqueIds = [...new Set(ids.map((id) => FileEntryIdSchema.parse(id)))];
    if (uniqueIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(fileEntryTable)
      .where(and(inArray(fileEntryTable.id, uniqueIds), isNull(fileEntryTable.deletedAt)));
    return rows.map(rowToFileEntry);
  }

  get(id: FileEntryId): Promise<FileEntry | null> {
    return this.findById(id);
  }

  async getById(id: FileEntryId): Promise<FileEntry> {
    const [entry] = await this.findAvailableByIds([id]);
    if (!entry) {
      throw DataApiErrorFactory.notFound('FileEntry', id);
    }
    return entry;
  }

  async create(values: CreateFileEntry, signal?: AbortSignal): Promise<FileEntry> {
    signal?.throwIfAborted();
    return this.dbService.withWriteTx(async (tx) => {
      signal?.throwIfAborted();
      const entry = await this.createTx(tx, values);
      signal?.throwIfAborted();
      return entry;
    });
  }

  async createTx(tx: Database, values: CreateFileEntry): Promise<FileEntry> {
    const {
      folderId,
      baseFileEntryId,
      conflictIfExists,
      workspaceFolderId,
      baseUpdatedAt,
      expectedName,
      ...parsed
    } = CreateFileEntrySchema.parse(values);
    const libraryFileId = await placeLibraryVersion(tx, parsed, {
      folderId,
      baseFileEntryId,
      conflictIfExists,
      workspaceFolderId,
      baseUpdatedAt,
      expectedName,
    });
    const [row] = await tx
      .insert(fileEntryTable)
      .values({ ...parsed, libraryFileId })
      .returning();
    if (!row) throw new Error('Insert did not return a FileEntry');
    return rowToFileEntry(row);
  }

  /**
   * Records the size of a rewritten draft blob. The only content write the
   * model allows: a draft is rewritable by the turn that produced it and
   * immutable afterwards (docs/references/data/file-model.md).
   */
  async updateSizeTx(tx: Database, id: FileEntryId, size: number): Promise<FileEntry> {
    const [row] = await tx
      .update(fileEntryTable)
      .set({
        size: z.int().nonnegative().parse(size),
        updatedAt: monotonicUpdateTimestamp(fileEntryTable.updatedAt),
      })
      .where(and(eq(fileEntryTable.id, id), isNull(fileEntryTable.deletedAt)))
      .returning();
    if (!row) throw DataApiErrorFactory.notFound('FileEntry', id);
    return rowToFileEntry(row);
  }

  async assertCurrentTx(
    tx: Database,
    id: FileEntryId,
    placement: { workspaceFolderId?: string | null; baseUpdatedAt?: number } = {},
  ): Promise<void> {
    const [row] = await tx
      .select({ file: libraryFileTable, entry: fileEntryTable })
      .from(fileEntryTable)
      .innerJoin(libraryFileTable, eq(fileEntryTable.libraryFileId, libraryFileTable.id))
      .where(
        and(
          eq(fileEntryTable.id, id),
          isNull(fileEntryTable.deletedAt),
          isNull(libraryFileTable.deletedAt),
        ),
      );
    if (!row) throw DataApiErrorFactory.notFound('FileEntry', id);
    if (row.file.currentEntryId !== id)
      throw DataApiErrorFactory.conflict(
        'The file has a newer version. Read it again before editing.',
      );
    if (placement.baseUpdatedAt !== undefined && row.entry.updatedAt !== placement.baseUpdatedAt)
      throw DataApiErrorFactory.conflict('The draft changed. Read it again before editing.');
    await requireWorkspaceDestination(tx, row.file.folderId, placement.workspaceFolderId);
  }

  async delete(id: FileEntryId): Promise<void> {
    await this.dbService.withWriteTx((tx) => this.deleteTx(tx, id));
  }

  async deleteTx(tx: Database, id: FileEntryId): Promise<void> {
    const [removed] = await tx.delete(fileEntryTable).where(eq(fileEntryTable.id, id)).returning();
    if (!removed?.libraryFileId) return;
    const [latest] = await tx
      .select()
      .from(fileEntryTable)
      .where(eq(fileEntryTable.libraryFileId, removed.libraryFileId))
      .orderBy(desc(fileEntryTable.createdAt), desc(fileEntryTable.id))
      .limit(1);
    if (!latest)
      await tx.delete(libraryFileTable).where(eq(libraryFileTable.id, removed.libraryFileId));
    else {
      const [file] = await tx
        .select()
        .from(libraryFileTable)
        .where(eq(libraryFileTable.id, removed.libraryFileId));
      if (file.currentEntryId !== id) return;
      await tx
        .update(libraryFileTable)
        .set({ currentEntryId: latest.id })
        .where(eq(libraryFileTable.id, file.id));
    }
  }
}

// Active file DTOs omit deletion state; the trash exposes its own metadata projection.
export function rowToFileEntry(row: FileEntryRow): FileEntry {
  return FileEntrySchema.parse({
    createdAt: row.createdAt,
    filename: row.filename,
    id: row.id,
    mediaType: row.mediaType,
    provenance: row.provenance,
    size: row.size,
    updatedAt: row.updatedAt,
  });
}

export const fileEntryService = new FileEntryService();
