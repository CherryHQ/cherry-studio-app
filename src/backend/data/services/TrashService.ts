import { and, eq, isNotNull, sql } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import { readSqliteRows } from '@/backend/data/db/readSqliteRows';
import { fileEntryTable } from '@/backend/data/db/schemas';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import {
  TrashQuerySchema,
  type TrashItem,
  type TrashSummary,
} from '@/shared/data/api/schemas/trash';

import { FILE_CLEANUP_KEY_PREFIX } from './FileEntryService';
import { asNumericKey, decodeListCursor, encodeCursor, keysetOrdering } from './utils/keysetCursor';

const trashRows = sql`(
  SELECT id, filename AS title, deleted_at, size, 'trashed' AS state FROM file_entry WHERE deleted_at IS NOT NULL
  UNION ALL
  SELECT json_extract(value, '$.entry.id') AS id,
    json_extract(value, '$.entry.filename') AS title, json_extract(value, '$.deletedAt') AS deleted_at,
    json_extract(value, '$.entry.size') AS size, 'deleting' AS state
  FROM app_state WHERE key GLOB ${`${FILE_CLEANUP_KEY_PREFIX}*`}
) AS trashed`;

/** Recoverable rows and committed unlink receipts share one trash projection. */
export class TrashService {
  constructor(private readonly dbService: DbService) {}

  async list(params: unknown = {}, signal?: AbortSignal) {
    const query = TrashQuerySchema.parse(params);
    const cursor = decodeListCursor(query.cursor, asNumericKey, 'trash');
    const ordering = keysetOrdering(sql`deleted_at`, sql`id`, {
      major: 'desc',
      tie: 'desc',
    });
    const condition = cursor ? ordering.where(cursor) : undefined;
    const rows = await readSqliteRows<TrashItem>(
      this.dbService.getSqlite(),
      sql`
      SELECT id, title, deleted_at AS "deletedAt", size, state FROM ${trashRows}
      WHERE ${condition ?? sql`1 = 1`} ORDER BY ${sql.join(ordering.orderBy, sql`, `)} LIMIT ${query.limit + 1}
    `,
      signal,
    );
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
    const [row] = await readSqliteRows<TrashSummary>(
      this.dbService.getSqlite(),
      sql`
      SELECT count(*) AS files,
        coalesce(sum(size), 0) AS "fileBytes" FROM ${trashRows}
    `,
    );
    return row;
  }

  async get(id: string): Promise<TrashItem> {
    const [row] = await readSqliteRows<TrashItem>(
      this.dbService.getSqlite(),
      sql`
      SELECT id, title, deleted_at AS "deletedAt", size, state FROM ${trashRows} WHERE id = ${id}
    `,
    );
    if (!row) throw DataApiErrorFactory.notFound('TrashItem', id);
    return row;
  }

  /** Snapshot the exact deletion time so a concurrent restore/re-delete cannot be purged. */
  async candidates(before?: number) {
    const condition =
      before === undefined ? undefined : sql`(state = 'deleting' OR deleted_at < ${before})`;
    return readSqliteRows<TrashItem>(
      this.dbService.getSqlite(),
      sql`
      SELECT id, title, deleted_at AS "deletedAt", size, state FROM ${trashRows} WHERE ${condition ?? sql`1 = 1`}
    `,
    );
  }

  async restore(id: string) {
    return this.dbService.withWriteTx(async (tx) => {
      const rows = await tx
        .update(fileEntryTable)
        .set({ deletedAt: null, updatedAt: sql`${fileEntryTable.updatedAt}` })
        .where(and(eq(fileEntryTable.id, id), isNotNull(fileEntryTable.deletedAt)))
        .returning({ id: fileEntryTable.id });
      if (!rows.length) throw DataApiErrorFactory.notFound('TrashItem', id);
    });
  }
}
