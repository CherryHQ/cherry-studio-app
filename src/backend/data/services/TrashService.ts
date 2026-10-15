import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import type { DbService } from '@/backend/data/db/DbService';
import { readSqliteRows } from '@/backend/data/db/readSqliteRows';
import { agentSessionTable, fileEntryTable } from '@/backend/data/db/schemas';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import {
  TrashQuerySchema,
  type TrashFilter,
  type TrashItem,
  type TrashKind,
  type TrashSummary,
} from '@/shared/data/api/schemas/trash';

import { asNumericKey, decodeListCursor, encodeCursor, keysetOrdering } from './utils/keysetCursor';

const trashRows = sql`(
  SELECT id, 'file' AS kind, filename AS title, deleted_at, size FROM file_entry WHERE deleted_at IS NOT NULL
  UNION ALL
  SELECT id, 'session' AS kind, name AS title, deleted_at, 0 AS size FROM agent_session WHERE deleted_at IS NOT NULL
) AS trashed`;

/** SQL owns trash membership; original records remain the only source of truth. */
export class TrashService {
  constructor(private readonly dbService: DbService) {}

  async list(params: unknown = {}, signal?: AbortSignal) {
    const query = TrashQuerySchema.parse(params);
    const cursor = decodeListCursor(query.cursor, asNumericKey, 'trash');
    const ordering = keysetOrdering(sql`deleted_at`, sql`kind || ':' || id`, {
      major: 'desc',
      tie: 'desc',
    });
    const condition = and(
      query.kind === 'all' ? undefined : sql`kind = ${query.kind}`,
      cursor ? ordering.where(cursor) : undefined,
    );
    const rows = await readSqliteRows<TrashItem>(
      this.dbService.getSqlite(),
      sql`
      SELECT id, kind, title, deleted_at AS "deletedAt", size FROM ${trashRows}
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
      SELECT count(CASE WHEN kind = 'file' THEN 1 END) AS files,
        count(CASE WHEN kind = 'session' THEN 1 END) AS sessions,
        coalesce(sum(size), 0) AS "fileBytes" FROM ${trashRows}
    `,
    );
    return row;
  }

  async get(kind: TrashKind, id: string): Promise<TrashItem> {
    const [row] = await readSqliteRows<TrashItem>(
      this.dbService.getSqlite(),
      sql`
      SELECT id, kind, title, deleted_at AS "deletedAt", size FROM ${trashRows} WHERE kind = ${kind} AND id = ${id}
    `,
    );
    if (!row) throw DataApiErrorFactory.notFound('TrashItem', id);
    return row;
  }

  /** Snapshot the exact deletion time so a concurrent restore/re-delete cannot be purged. */
  async candidates(kind: TrashFilter, before?: number) {
    const condition = and(
      kind === 'all' ? undefined : sql`kind = ${kind}`,
      before === undefined ? undefined : sql`deleted_at < ${before}`,
    );
    return readSqliteRows<TrashItem>(
      this.dbService.getSqlite(),
      sql`
      SELECT id, kind, title, deleted_at AS "deletedAt", size FROM ${trashRows} WHERE ${condition ?? sql`1 = 1`}
    `,
    );
  }

  async restore(kind: TrashKind, id: string) {
    return this.dbService.withWriteTx(async (tx) => {
      if (kind === 'file') {
        const rows = await tx
          .update(fileEntryTable)
          .set({ deletedAt: null, updatedAt: sql`${fileEntryTable.updatedAt}` })
          .where(and(eq(fileEntryTable.id, id), isNotNull(fileEntryTable.deletedAt)))
          .returning({ id: fileEntryTable.id });
        if (!rows.length) throw DataApiErrorFactory.notFound('TrashItem', id);
      } else {
        const rows = await tx
          .update(agentSessionTable)
          .set({ deletedAt: null })
          .where(and(eq(agentSessionTable.id, id), isNotNull(agentSessionTable.deletedAt)))
          .returning({ id: agentSessionTable.id });
        if (!rows.length) throw DataApiErrorFactory.notFound('TrashItem', id);
      }
    });
  }

  async deleteSession(item: TrashItem) {
    const forks = await this.dbService.withWriteTx(async (tx) => {
      const [session] = await tx
        .select({ id: agentSessionTable.id })
        .from(agentSessionTable)
        .where(
          and(eq(agentSessionTable.id, item.id), eq(agentSessionTable.deletedAt, item.deletedAt)),
        )
        .limit(1);
      if (!session) return null;
      const forks = await tx
        .update(agentSessionTable)
        .set({ forkBoundaryMessageId: null, forkedFromSessionId: null })
        .where(eq(agentSessionTable.forkedFromSessionId, item.id))
        .returning({ id: agentSessionTable.id });
      await tx.delete(agentSessionTable).where(eq(agentSessionTable.id, item.id));
      return forks;
    });
    if (forks === null) return false;
    publishDataApiChanges(forks.map(({ id }) => `/agent-sessions/${id}`));
    return true;
  }
}
