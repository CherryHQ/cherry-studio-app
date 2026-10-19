import { sql } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import { readSqliteRows } from '@/backend/data/db/readSqliteRows';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import {
  TrashQuerySchema,
  type TrashItem,
  type TrashKind,
  type TrashSummary,
} from '@/shared/data/api/schemas/trash';

import { FileLibraryService } from './FileLibraryService';
import { asNumericKey, decodeListCursor, encodeCursor, keysetOrdering } from './utils/keysetCursor';

const trashRows = sql`(
  SELECT id, 'file' AS kind, name AS title, deleted_at,
    (SELECT coalesce(sum(size), 0) FROM file_entry WHERE library_file_id = library_file.id) AS size, current_entry_id AS thumbnail_entry_id
    FROM library_file WHERE deleted_at IS NOT NULL AND trashed_with IS NULL
  UNION ALL
  SELECT id, 'folder' AS kind, name AS title, deleted_at,
    (SELECT coalesce(sum(size), 0) FROM file_entry WHERE trashed_with = file_folder.id) AS size, NULL AS thumbnail_entry_id
    FROM file_folder WHERE deleted_at IS NOT NULL AND trashed_with IS NULL
) AS trashed`;

/** Projects recoverable files and folders into one cursor stream. */
export class TrashService {
  constructor(private readonly dbService: DbService) {}

  async list(params: unknown = {}, signal?: AbortSignal) {
    const query = TrashQuerySchema.parse(params);
    const cursor = decodeListCursor(query.cursor, asNumericKey, 'trash');
    const ordering = keysetOrdering(sql`deleted_at`, sql`kind || ':' || id`, {
      major: 'desc',
      tie: 'desc',
    });
    const condition = cursor ? ordering.where(cursor) : undefined;
    const rows = await readSqliteRows<TrashItem>(
      this.dbService.getSqlite(),
      sql`
      SELECT id, kind, title, deleted_at AS "deletedAt", size, thumbnail_entry_id AS "thumbnailEntryId" FROM ${trashRows}
      WHERE ${condition ?? sql`1 = 1`} ORDER BY ${sql.join(ordering.orderBy, sql`, `)} LIMIT ${query.limit + 1}
    `,
      signal,
    );
    const items = rows.slice(0, query.limit);
    const tail = items.at(-1);
    return {
      items,
      ...(rows.length > query.limit && tail
        ? { nextCursor: encodeCursor(tail.deletedAt, `${tail.kind}:${tail.id}`) }
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

  async get(kind: TrashKind, id: string): Promise<TrashItem> {
    const [row] = await readSqliteRows<TrashItem>(
      this.dbService.getSqlite(),
      sql`
      SELECT id, kind, title, deleted_at AS "deletedAt", size, thumbnail_entry_id AS "thumbnailEntryId" FROM ${trashRows} WHERE kind = ${kind} AND id = ${id}
    `,
    );
    if (!row) throw DataApiErrorFactory.notFound('TrashItem', id);
    return row;
  }

  /** Snapshot the exact deletion time so a concurrent restore/re-delete cannot be purged. */
  async candidates(before?: number) {
    const condition = before === undefined ? undefined : sql`deleted_at < ${before}`;
    return readSqliteRows<TrashItem>(
      this.dbService.getSqlite(),
      sql`
      SELECT id, kind, title, deleted_at AS "deletedAt", size, thumbnail_entry_id AS "thumbnailEntryId" FROM ${trashRows} WHERE ${condition ?? sql`1 = 1`}
    `,
    );
  }

  restore(kind: TrashKind, id: string, signal?: AbortSignal) {
    return new FileLibraryService(this.dbService).restore(kind, id, signal);
  }
}
