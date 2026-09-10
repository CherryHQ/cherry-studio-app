import { and, asc, desc, eq, getTableColumns, gt, gte, lt, lte, or, sql } from 'drizzle-orm';

import type { DbService } from '../db/DbService';
import { agentSessionTable } from '../db/schemas/agentSession';
import { agentSessionMessageTable } from '../db/schemas/agentSessionMessage';

// Measure the raw row envelope in SQLite. Inspection and budget selection must
// not load a page of complete conversation bodies into the Hermes heap.
const messageJsonFields = Object.entries(getTableColumns(agentSessionMessageTable)).map(
  ([key, column]) =>
    sql`${sql.raw(`'${key.replace(/'/g, "''")}'`)}, ${column.dataType === 'json' ? sql`json(${column})` : column}`,
);
const messageJsonBytes = sql<number>`length(cast(json_object(${sql.join(messageJsonFields, sql`, `)}) as blob))`;

/** Read raw persisted entities, including errors and inference/context snapshots. */
export function createDiagnosticChatReader(database: Pick<DbService, 'getDb'>) {
  return {
    async page(
      range: { fromMs: number; toMs: number },
      cursor?: { createdAt: number; id: string },
    ) {
      const table = agentSessionMessageTable;
      return database
        .getDb()
        .select({
          id: table.id,
          sessionId: table.sessionId,
          createdAt: table.createdAt,
          entityJsonBytes: messageJsonBytes,
        })
        .from(table)
        .where(
          and(
            gte(table.createdAt, range.fromMs),
            lte(table.createdAt, range.toMs),
            cursor
              ? or(
                  lt(table.createdAt, cursor.createdAt),
                  and(eq(table.createdAt, cursor.createdAt), gt(table.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(table.createdAt), asc(table.id))
        .limit(100);
    },
    async session(id: string) {
      return (
        await database
          .getDb()
          .select()
          .from(agentSessionTable)
          .where(eq(agentSessionTable.id, id))
          .limit(1)
      )[0];
    },
    async message(sessionId: string, id: string) {
      const table = agentSessionMessageTable;
      return (
        await database
          .getDb()
          .select()
          .from(table)
          .where(and(eq(table.id, id), eq(table.sessionId, sessionId)))
          .limit(1)
      )[0];
    },
  };
}

export type DiagnosticChatReader = ReturnType<typeof createDiagnosticChatReader>;
