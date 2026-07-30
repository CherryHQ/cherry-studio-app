import { eq } from 'drizzle-orm';

import type { Database, DbService } from '@/backend/data/db/DbService';
import { type FileEntryRow, fileEntryTable } from '@/backend/data/db/schemas';
import {
  type FileEntry,
  type FileEntryId,
  FileEntrySchema,
  type PreparedInternalFile,
  type ResolvedFile,
} from '@/shared/data/types/file';

import { resolveInternalFileUri } from './fileStorage';

export class FileEntryService {
  constructor(private readonly dbService: DbService) {}

  private get db() {
    return this.dbService.getDb();
  }

  async findById(id: FileEntryId): Promise<FileEntry | null> {
    const [row] = await this.db
      .select()
      .from(fileEntryTable)
      .where(eq(fileEntryTable.id, id))
      .limit(1);
    return row ? rowToFileEntry(row) : null;
  }

  get(id: FileEntryId): Promise<FileEntry | null> {
    return this.findById(id);
  }

  async createPreparedEntriesTx(
    tx: Database,
    files: readonly PreparedInternalFile[],
  ): Promise<void> {
    if (files.length === 0) {
      return;
    }

    await tx.insert(fileEntryTable).values(
      files.map(({ ext, id, name, size }) => ({
        ext,
        id,
        name,
        origin: 'internal',
        size,
      })),
    );
  }

  async resolveUri(id: FileEntryId): Promise<string | undefined> {
    const entry = await this.findById(id);
    if (!entry || entry.origin !== 'internal') {
      return undefined;
    }
    return resolveInternalFileUri(entry);
  }

  async resolve(id: FileEntryId): Promise<ResolvedFile | null> {
    const [entry, uri] = await Promise.all([this.findById(id), this.resolveUri(id)]);
    return entry && uri ? { entry, uri } : null;
  }

  resolveRenderableUri(id: FileEntryId): Promise<string | undefined> {
    return this.resolveUri(id);
  }
}

function rowToFileEntry(row: FileEntryRow): FileEntry {
  if (row.origin === 'internal') {
    return FileEntrySchema.parse({
      createdAt: row.createdAt,
      ...(row.deletedAt !== null ? { deletedAt: row.deletedAt } : {}),
      ext: row.ext,
      id: row.id,
      name: row.name,
      origin: 'internal',
      size: row.size,
      updatedAt: row.updatedAt,
    });
  }

  return FileEntrySchema.parse({
    createdAt: row.createdAt,
    ext: row.ext,
    externalPath: row.externalPath,
    id: row.id,
    name: row.name,
    origin: 'external',
    updatedAt: row.updatedAt,
  });
}
