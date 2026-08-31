import { and, eq, inArray, isNull } from 'drizzle-orm';
import * as z from 'zod';

import { application } from '@/backend/core/application/Application';
import type { Database } from '@/backend/data/db/DbService';
import { type FileEntryRow, fileEntryTable } from '@/backend/data/db/schemas';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type { FileEntryListQuery } from '@/shared/data/api/schemas/files';
import type { CursorPaginationResponse } from '@/shared/data/api/types';
import type { FileEntry, FileEntryId } from '@/shared/data/types/file';
import {
  FileEntryIdSchema,
  FileEntryProvenanceSchema,
  FileEntrySchema,
  MediaTypeSchema,
  SafeNameSchema,
} from '@/shared/data/types/file';

import { asNumericKey, decodeListCursor, encodeCursor, keysetOrdering } from './utils/keysetCursor';

const CreateFileEntrySchema = z.strictObject({
  filename: SafeNameSchema,
  id: FileEntryIdSchema,
  mediaType: MediaTypeSchema,
  // No default: every creation site states an origin, so a new one (a peer
  // transfer, a future import path) cannot silently inherit a wrong answer.
  provenance: FileEntryProvenanceSchema,
  size: z.int().nonnegative(),
});

export type CreateFileEntry = z.input<typeof CreateFileEntrySchema>;

const defaultLimit = 30;
const maxLimit = 100;

export class FileEntryService {
  /**
   * Resolved per call rather than injected once, so the instance holds no
   * reference to a particular host generation and a replaced host cannot leave
   * this singleton writing to a closed connection.
   */
  private get dbService() {
    return application.get('DbService');
  }

  private get db() {
    return this.dbService.getDb();
  }

  withWriteTx<TValue>(callback: (tx: Database) => Promise<TValue>): Promise<TValue> {
    return this.dbService.withWriteTx(callback);
  }

  /**
   * Newest first, paged by `(createdAt, id)` — the one stream the file library
   * browses, which its kind tabs then partition client-side. Ordered uuids
   * break `createdAt` ties in insertion order, so the tie-break direction
   * matches the major sort.
   *
   * `deletedAt` is deliberately not consulted: nothing writes it today (it is
   * reserved for the future trash), so filtering on it here would encode a
   * lifecycle the rest of the file model does not have yet.
   */
  async listByCursor(query: FileEntryListQuery = {}): Promise<CursorPaginationResponse<FileEntry>> {
    const limit = Math.min(Math.max(query.limit ?? defaultLimit, 1), maxLimit);
    const cursor = decodeListCursor(query.cursor, asNumericKey, 'file-entries');
    const keyset = keysetOrdering(fileEntryTable.createdAt, fileEntryTable.id, {
      major: 'desc',
      tie: 'desc',
    });
    const rows = await this.db
      .select()
      .from(fileEntryTable)
      .where(cursor ? keyset.where(cursor) : undefined)
      .orderBy(...keyset.orderBy)
      .limit(limit + 1);

    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(rowToFileEntry),
      ...(rows.length > limit && last ? { nextCursor: encodeCursor(last.createdAt, last.id) } : {}),
    };
  }

  async findById(id: FileEntryId): Promise<FileEntry | null> {
    return this.findByIdTx(this.db, id);
  }

  async findByIdTx(tx: Database, id: FileEntryId): Promise<FileEntry | null> {
    const [row] = await tx.select().from(fileEntryTable).where(eq(fileEntryTable.id, id)).limit(1);
    return row ? rowToFileEntry(row) : null;
  }

  /**
   * Batch lookup for submission-time owners. Soft-deleted rows are unavailable
   * even though ordinary historical reads may still need their references.
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

  async create(values: CreateFileEntry): Promise<FileEntry> {
    return this.dbService.withWriteTx((tx) => this.createTx(tx, values));
  }

  async createTx(tx: Database, values: CreateFileEntry): Promise<FileEntry> {
    const parsed = CreateFileEntrySchema.parse(values);
    const [row] = await tx.insert(fileEntryTable).values(parsed).returning();
    if (!row) throw new Error('Insert did not return a FileEntry');
    return rowToFileEntry(row);
  }

  async delete(id: FileEntryId): Promise<void> {
    await this.dbService.withWriteTx((tx) => this.deleteTx(tx, id));
  }

  async deleteTx(tx: Database, id: FileEntryId): Promise<void> {
    await tx.delete(fileEntryTable).where(eq(fileEntryTable.id, id));
  }
}

// `deletedAt` stays DB-only: reserved for the future file-library trash, so the
// serialized entry deliberately has no field for it.
function rowToFileEntry(row: FileEntryRow): FileEntry {
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
