import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/errors';
import type {
  FileEntryListResponse,
  FileEntryStats,
  ResolvedFile,
} from '@cherrystudio/universal/data/api/schemas/files';
import type {
  CleanupPolicy,
  ContentHash,
  FileEntry,
  FileEntryId,
  FileEntryOrigin,
  InternalFileEntry,
} from '@cherrystudio/universal/data/types/file';
import {
  AbsoluteFilePathSchema,
  CleanupPolicySchema,
  ContentHashSchema,
  ExternalEntrySchema,
  FileEntrySchema,
  InternalEntrySchema,
  SafeNameSchema,
} from '@cherrystudio/universal/data/types/file';
import {
  and,
  asc,
  count,
  eq,
  isNotNull,
  isNull,
  lt,
  type SQL,
  sql,
  type SQLWrapper,
} from 'drizzle-orm';
import * as z from 'zod';

import type { Database, DbService } from '@/backend/data/db/DbService';
import { type FileEntryRow, fileEntryTable } from '@/backend/data/db/schemas';
import { createOrderedUuid } from '@/backend/data/db/schemas/_columnHelpers';
import { persistentRefAbsenceConditions } from '@/backend/data/db/schemas/fileRelations';
import type { PreparedInternalFile } from '@/backend/types/file';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  asNumericKey,
  asStringKey,
  decodeListCursor,
  encodeCursor,
  keysetOrdering,
} from './utils/keysetCursor';

const logger = loggerService.withContext('FileEntryService');

const CreateFileEntrySchema = z.discriminatedUnion('origin', [
  z.strictObject({
    cleanupPolicy: CleanupPolicySchema,
    contentHash: ContentHashSchema.nullable().optional(),
    ext: InternalEntrySchema.shape.ext,
    id: InternalEntrySchema.shape.id,
    name: InternalEntrySchema.shape.name,
    origin: z.literal('internal'),
    size: InternalEntrySchema.shape.size,
  }),
  z.strictObject({
    cleanupPolicy: CleanupPolicySchema,
    ext: ExternalEntrySchema.shape.ext,
    externalPath: AbsoluteFilePathSchema,
    name: ExternalEntrySchema.shape.name,
    origin: z.literal('external'),
  }),
]);

export type CreateFileEntry = z.input<typeof CreateFileEntrySchema>;

export type UpdateFileEntry = {
  cleanupPolicy?: CleanupPolicy;
  deletedAt?: number | null;
  ext?: string | null;
  name?: string;
};

export type FindFileEntriesQuery = {
  inTrash?: boolean;
  limit?: number;
  offset?: number;
  origin?: FileEntryOrigin;
};

export type ListFileEntriesQuery = {
  cursor?: string;
  inTrash?: boolean;
  limit?: number;
  origin?: FileEntryOrigin;
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'size' | 'ext';
  sortOrder?: 'asc' | 'desc';
};

type InternalFileUriResolver = (entry: Pick<InternalFileEntry, 'ext' | 'id'>) => string | undefined;

type ListSortBy = NonNullable<ListFileEntriesQuery['sortBy']>;
const FILE_ENTRY_SIZE_NULL_SORT_VALUE = -1;
const FILE_ENTRY_EXT_NULL_SORT_VALUE = ' ';

export class FileEntryService {
  constructor(
    private readonly dbService: DbService,
    private readonly resolveInternalFileUri: InternalFileUriResolver,
  ) {}

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

  async findInternalByContentHash(contentHash: ContentHash): Promise<FileEntry[]> {
    const rows = await this.db
      .select()
      .from(fileEntryTable)
      .where(
        and(
          eq(fileEntryTable.origin, 'internal'),
          isNull(fileEntryTable.deletedAt),
          eq(fileEntryTable.contentHash, ContentHashSchema.parse(contentHash)),
        ),
      )
      .orderBy(asc(fileEntryTable.createdAt), asc(fileEntryTable.id));
    return rows.flatMap(rowToFileEntrySafe);
  }

  async findMany(query: FindFileEntriesQuery = {}): Promise<FileEntry[]> {
    return this.findManyTx(this.db, query);
  }

  async findManyTx(tx: Database, query: FindFileEntriesQuery = {}): Promise<FileEntry[]> {
    const conditions = fileEntryFilters(query);
    let statement = tx
      .select()
      .from(fileEntryTable)
      .where(and(...conditions))
      .orderBy(asc(fileEntryTable.createdAt), asc(fileEntryTable.id))
      .$dynamic();
    if (query.limit !== undefined) statement = statement.limit(query.limit);
    if (query.offset !== undefined) statement = statement.offset(query.offset);
    return (await statement).flatMap(rowToFileEntrySafe);
  }

  async listCursor(query: ListFileEntriesQuery = {}): Promise<FileEntryListResponse> {
    const filters = fileEntryFilters(query);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'asc';
    const ordering = keysetOrdering(getListSortExpression(sortBy), fileEntryTable.id, {
      major: sortOrder,
      tie: sortOrder,
    });
    const cursor = decodeListCursor(query.cursor, getListCursorParser(sortBy), 'file-entry');
    const conditions = cursor ? [...filters, ordering.where(cursor)] : filters;
    const pageSize = query.limit ?? 50;
    const rows = await this.db
      .select()
      .from(fileEntryTable)
      .where(and(...conditions))
      .orderBy(...ordering.orderBy)
      .limit(pageSize + 1);
    const [{ total = 0 } = {}] = await this.db
      .select({ total: count() })
      .from(fileEntryTable)
      .where(and(...filters));
    const pageRows = rows.slice(0, pageSize);
    const last = pageRows.at(-1);
    return {
      items: pageRows.flatMap(rowToFileEntrySafe),
      nextCursor:
        rows.length > pageSize && last
          ? encodeCursor(getListSortValue(last, sortBy), last.id)
          : undefined,
      total,
    };
  }

  async getStats(): Promise<FileEntryStats> {
    const [[active], [trash], extRows] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(fileEntryTable)
        .where(isNull(fileEntryTable.deletedAt)),
      this.db
        .select({ count: count() })
        .from(fileEntryTable)
        .where(isNotNull(fileEntryTable.deletedAt)),
      this.db
        .select({ count: count(), ext: fileEntryTable.ext })
        .from(fileEntryTable)
        .where(isNull(fileEntryTable.deletedAt))
        .groupBy(fileEntryTable.ext),
    ]);
    return {
      activeTotal: active?.count ?? 0,
      extCounts: extRows,
      trashTotal: trash?.count ?? 0,
    };
  }

  async findManualUnreferenced(query: { origin?: FileEntryOrigin } = {}): Promise<FileEntry[]> {
    const conditions: SQL[] = [
      isNull(fileEntryTable.deletedAt),
      eq(fileEntryTable.cleanupPolicy, 'manual'),
      ...persistentRefAbsenceConditions(),
    ];
    if (query.origin) conditions.push(eq(fileEntryTable.origin, query.origin));
    const rows = await this.db
      .select()
      .from(fileEntryTable)
      .where(and(...conditions))
      .orderBy(asc(fileEntryTable.createdAt), asc(fileEntryTable.id));
    return rows.flatMap(rowToFileEntrySafe);
  }

  async findCleanupCandidates(options: { graceMs: number; limit: number }): Promise<FileEntry[]> {
    const rows = await this.db
      .select()
      .from(fileEntryTable)
      .where(
        and(
          eq(fileEntryTable.cleanupPolicy, 'delete_when_unreferenced'),
          lt(fileEntryTable.createdAt, Date.now() - options.graceMs),
          ...persistentRefAbsenceConditions(),
        ),
      )
      .orderBy(asc(fileEntryTable.createdAt), asc(fileEntryTable.id))
      .limit(options.limit);
    return rows.flatMap(rowToFileEntrySafe);
  }

  async listAllIds(): Promise<Set<FileEntryId>> {
    const rows = await this.db.select({ id: fileEntryTable.id }).from(fileEntryTable);
    return new Set(rows.map(({ id }) => id));
  }

  async create(values: CreateFileEntry): Promise<FileEntry> {
    return this.dbService.withWriteTx((tx) => this.createTx(tx, values));
  }

  async createTx(tx: Database, values: CreateFileEntry): Promise<FileEntry> {
    const parsed = CreateFileEntrySchema.parse(values);
    const [row] = await tx
      .insert(fileEntryTable)
      .values({
        cleanupPolicy: parsed.cleanupPolicy,
        contentHash: parsed.origin === 'internal' ? (parsed.contentHash ?? null) : null,
        deletedAt: null,
        ext: parsed.ext,
        externalPath: parsed.origin === 'external' ? parsed.externalPath : null,
        id: parsed.origin === 'internal' ? parsed.id : createOrderedUuid(),
        name: parsed.name,
        origin: parsed.origin,
        size: parsed.origin === 'internal' ? parsed.size : null,
      })
      .returning();
    if (!row) throw new Error('Insert did not return a FileEntry');
    return rowToFileEntry(row);
  }

  async createPreparedEntriesTx(
    tx: Database,
    files: readonly PreparedInternalFile[],
  ): Promise<void> {
    if (files.length === 0) return;
    await tx.insert(fileEntryTable).values(
      files.map(({ ext, id, name, size }) => ({
        cleanupPolicy: 'manual' as const,
        contentHash: null,
        ext,
        id,
        name,
        origin: 'internal' as const,
        size,
      })),
    );
  }

  async update(id: FileEntryId, values: UpdateFileEntry): Promise<FileEntry> {
    return this.dbService.withWriteTx((tx) => this.updateTx(tx, id, values));
  }

  async updateTx(tx: Database, id: FileEntryId, values: UpdateFileEntry): Promise<FileEntry> {
    if (values.name !== undefined) SafeNameSchema.parse(values.name);
    if (values.ext !== undefined) InternalEntrySchema.shape.ext.parse(values.ext);
    if (values.cleanupPolicy !== undefined) CleanupPolicySchema.parse(values.cleanupPolicy);
    if (values.cleanupPolicy === 'delete_when_unreferenced') {
      const current = await this.findByIdTx(tx, id);
      if (current?.cleanupPolicy === 'manual') {
        throw DataApiErrorFactory.invalidOperation(
          'update FileEntry',
          `cleanupPolicy cannot change from manual to delete_when_unreferenced (${id})`,
        );
      }
    }

    const updates: Partial<typeof fileEntryTable.$inferInsert> = { updatedAt: Date.now() };
    if (values.cleanupPolicy !== undefined) updates.cleanupPolicy = values.cleanupPolicy;
    if (values.deletedAt !== undefined) updates.deletedAt = values.deletedAt;
    if (values.ext !== undefined) updates.ext = values.ext;
    if (values.name !== undefined) updates.name = values.name;
    const [row] = await tx
      .update(fileEntryTable)
      .set(updates)
      .where(eq(fileEntryTable.id, id))
      .returning();
    if (!row) throw DataApiErrorFactory.notFound('FileEntry', id);
    return rowToFileEntry(row);
  }

  async delete(id: FileEntryId): Promise<void> {
    await this.dbService.withWriteTx((tx) => this.deleteTx(tx, id));
  }

  async deleteTx(tx: Database, id: FileEntryId): Promise<void> {
    await tx.delete(fileEntryTable).where(eq(fileEntryTable.id, id));
  }

  async resolveUri(id: FileEntryId): Promise<string | undefined> {
    const entry = await this.findById(id);
    return entry?.origin === 'internal' ? this.resolveInternalFileUri(entry) : undefined;
  }

  async resolve(id: FileEntryId): Promise<ResolvedFile | null> {
    const entry = await this.findById(id);
    if (!entry || entry.origin !== 'internal') return null;
    const uri = this.resolveInternalFileUri(entry);
    return uri ? { entry, uri } : null;
  }

  resolveRenderableUri(id: FileEntryId): Promise<string | undefined> {
    return this.resolveUri(id);
  }
}

function fileEntryFilters(query: { inTrash?: boolean; origin?: FileEntryOrigin }): SQL[] {
  const filters: SQL[] = [
    query.inTrash === true ? isNotNull(fileEntryTable.deletedAt) : isNull(fileEntryTable.deletedAt),
  ];
  if (query.origin) filters.push(eq(fileEntryTable.origin, query.origin));
  return filters;
}

function rowToFileEntry(row: FileEntryRow): FileEntry {
  if (row.origin === 'internal') {
    return FileEntrySchema.parse({
      cleanupPolicy: row.cleanupPolicy,
      contentHash: row.contentHash,
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
    cleanupPolicy: row.cleanupPolicy,
    createdAt: row.createdAt,
    ext: row.ext,
    externalPath: row.externalPath,
    id: row.id,
    name: row.name,
    origin: 'external',
    updatedAt: row.updatedAt,
  });
}

function rowToFileEntrySafe(row: FileEntryRow): FileEntry[] {
  try {
    return [rowToFileEntry(row)];
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    logger.warn('Skipping unparseable file_entry row in bulk read', error, { id: row.id });
    return [];
  }
}

function getListSortValue(row: FileEntryRow, sortBy: ListSortBy): string | number {
  switch (sortBy) {
    case 'name':
      return row.name;
    case 'updatedAt':
      return row.updatedAt;
    case 'size':
      return row.size ?? FILE_ENTRY_SIZE_NULL_SORT_VALUE;
    case 'ext':
      return row.ext ?? FILE_ENTRY_EXT_NULL_SORT_VALUE;
    case 'createdAt':
      return row.createdAt;
  }
}

function getListSortExpression(sortBy: ListSortBy): SQLWrapper {
  switch (sortBy) {
    case 'name':
      return fileEntryTable.name;
    case 'updatedAt':
      return fileEntryTable.updatedAt;
    case 'size':
      return sql<number>`coalesce(${fileEntryTable.size}, ${FILE_ENTRY_SIZE_NULL_SORT_VALUE})`;
    case 'ext':
      return sql<string>`coalesce(${fileEntryTable.ext}, ${FILE_ENTRY_EXT_NULL_SORT_VALUE})`;
    case 'createdAt':
      return fileEntryTable.createdAt;
  }
}

function getListCursorParser(sortBy: ListSortBy): (raw: string) => string | number | null {
  return sortBy === 'name' || sortBy === 'ext'
    ? (raw) => asStringKey(raw)
    : (raw) => asNumericKey(raw);
}
