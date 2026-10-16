import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import { fileEntryTable } from '@/backend/data/db/schemas';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import {
  TrashQuerySchema,
  type TrashItem,
  type TrashSummary,
} from '@/shared/data/api/schemas/trash';

import { asNumericKey, decodeListCursor, encodeCursor, keysetOrdering } from './utils/keysetCursor';

const trashColumns = {
  id: fileEntryTable.id,
  title: fileEntryTable.filename,
  // Only trashed rows are selected, so the column is never null here.
  deletedAt: sql<number>`${fileEntryTable.deletedAt}`,
  size: fileEntryTable.size,
};
const trashed = isNotNull(fileEntryTable.deletedAt);

/** Projects trashed file rows; `file_entry.deletedAt` owns trash membership. */
export class TrashService {
  constructor(private readonly dbService: DbService) {}

  private get db() {
    return this.dbService.getDb();
  }

  async list(params: unknown = {}) {
    const query = TrashQuerySchema.parse(params);
    const cursor = decodeListCursor(query.cursor, asNumericKey, 'trash');
    const ordering = keysetOrdering(fileEntryTable.deletedAt, fileEntryTable.id, {
      major: 'desc',
      tie: 'desc',
    });
    const rows: TrashItem[] = await this.db
      .select(trashColumns)
      .from(fileEntryTable)
      .where(and(trashed, cursor ? ordering.where(cursor) : undefined))
      .orderBy(...ordering.orderBy)
      .limit(query.limit + 1);
    const items = rows.slice(0, query.limit);
    const tail = items.at(-1);
    return {
      items,
      ...(rows.length > query.limit && tail
        ? { nextCursor: encodeCursor(tail.deletedAt, tail.id) }
        : {}),
    };
  }

  async summary(): Promise<TrashSummary> {
    const [row] = await this.db
      .select({
        files: sql<number>`count(*)`,
        fileBytes: sql<number>`coalesce(sum(${fileEntryTable.size}), 0)`,
      })
      .from(fileEntryTable)
      .where(trashed);
    return row;
  }

  async get(id: string): Promise<TrashItem> {
    const [row] = await this.db
      .select(trashColumns)
      .from(fileEntryTable)
      .where(and(eq(fileEntryTable.id, id), trashed))
      .limit(1);
    if (!row) throw DataApiErrorFactory.notFound('TrashItem', id);
    return row;
  }

  /** Snapshot the exact deletion time so a concurrent restore/re-delete cannot be purged. */
  candidates(before?: number): Promise<TrashItem[]> {
    return this.db
      .select(trashColumns)
      .from(fileEntryTable)
      .where(and(trashed, before === undefined ? undefined : lt(fileEntryTable.deletedAt, before)));
  }

  async restore(id: string) {
    return this.dbService.withWriteTx(async (tx) => {
      const rows = await tx
        .update(fileEntryTable)
        .set({ deletedAt: null, updatedAt: sql`${fileEntryTable.updatedAt}` })
        .where(and(eq(fileEntryTable.id, id), trashed))
        .returning({ id: fileEntryTable.id });
      if (!rows.length) throw DataApiErrorFactory.notFound('TrashItem', id);
    });
  }
}
