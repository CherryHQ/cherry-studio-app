import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/errors';
import type { FileEntry, FileEntryId } from '@cherrystudio/universal/data/types/file';
import {
  FileEntryIdSchema,
  FileEntrySchema,
  MediaTypeSchema,
  SafeNameSchema,
} from '@cherrystudio/universal/data/types/file';
import { eq } from 'drizzle-orm';
import * as z from 'zod';

import { application } from '@/backend/core/application/Application';
import type { Database } from '@/backend/data/db/DbService';
import { type FileEntryRow, fileEntryTable } from '@/backend/data/db/schemas';

const CreateFileEntrySchema = z.strictObject({
  filename: SafeNameSchema,
  id: FileEntryIdSchema,
  mediaType: MediaTypeSchema,
  size: z.int().nonnegative(),
});

export type CreateFileEntry = z.input<typeof CreateFileEntrySchema>;

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

  async findById(id: FileEntryId): Promise<FileEntry | null> {
    return this.findByIdTx(this.db, id);
  }

  async findByIdTx(tx: Database, id: FileEntryId): Promise<FileEntry | null> {
    const [row] = await tx.select().from(fileEntryTable).where(eq(fileEntryTable.id, id)).limit(1);
    return row ? rowToFileEntry(row) : null;
  }

  get(id: FileEntryId): Promise<FileEntry | null> {
    return this.findById(id);
  }

  async getById(id: FileEntryId): Promise<FileEntry> {
    const entry = await this.findById(id);
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
    size: row.size,
    updatedAt: row.updatedAt,
  });
}

export const fileEntryService = new FileEntryService();
