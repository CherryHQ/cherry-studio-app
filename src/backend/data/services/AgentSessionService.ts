import { and, eq, sql } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { readSqliteRows } from '@/backend/data/db/readSqliteRows';
import { agentSessionTable } from '@/backend/data/db/schemas';
import type { AgentSessionRow } from '@/backend/data/db/schemas/agentSession';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import {
  type AgentSessionEntity,
  type ListAgentSessionsQueryParams,
  ListAgentSessionsQuerySchema,
} from '@/shared/data/api/schemas/agentSessions';
import type { CursorPaginationResponse } from '@/shared/data/api/types';

import { toAgentSessionEntity } from './utils/agentSessionRows';
import { asNumericKey, decodeListCursor, encodeCursor, keysetOrdering } from './utils/keysetCursor';

const DEFAULT_LIMIT = 50;

type SessionListRow = Omit<AgentSessionRow, 'executionTarget' | 'titleIsManual'> & {
  executionTarget: string;
  titleIsManual: number;
};

/** SQL-only static reads for Agent Sessions. Live turn state stays in MobileAgentHost. */
export class AgentSessionService {
  private get db() {
    return application.get('DbService').getDb();
  }

  async getById(id: string): Promise<AgentSessionEntity> {
    const [row] = await this.db
      .select()
      .from(agentSessionTable)
      .where(eq(agentSessionTable.id, id))
      .limit(1);
    if (!row) {
      throw DataApiErrorFactory.notFound('AgentSession', id);
    }
    return toAgentSessionEntity(row);
  }

  async listByCursor(
    params: ListAgentSessionsQueryParams = {},
    signal?: AbortSignal,
  ): Promise<CursorPaginationResponse<AgentSessionEntity>> {
    const query = ListAgentSessionsQuerySchema.parse(params);
    const limit = query.limit ?? DEFAULT_LIMIT;
    const cursor = decodeListCursor(query.cursor, asNumericKey, 'agent-sessions');
    const ordering = keysetOrdering(agentSessionTable.lastActivityAt, agentSessionTable.id, {
      major: 'desc',
      tie: 'desc',
    });
    const condition = and(
      query.agentId ? eq(agentSessionTable.agentId, query.agentId) : undefined,
      query.q
        ? sql`${agentSessionTable.title} LIKE ${`%${query.q.replace(/[\\%_]/g, '\\$&')}%`} ESCAPE '\\'`
        : undefined,
      cursor ? ordering.where(cursor) : undefined,
    );
    const rows = await readSqliteRows<SessionListRow>(
      application.get('DbService').getSqlite(),
      sql`
        SELECT id, agent_id AS "agentId", name AS "title",
          is_name_manually_edited AS "titleIsManual", execution_target AS "executionTarget",
          last_activity_at AS "lastActivityAt", created_at AS "createdAt", updated_at AS "updatedAt",
          forked_from_session_id AS "forkedFromSessionId", fork_boundary_message_id AS "forkBoundaryMessageId"
        FROM ${agentSessionTable}
        WHERE ${condition ?? sql`1 = 1`}
        ORDER BY ${sql.join(ordering.orderBy, sql`, `)}
        LIMIT ${limit + 1}
      `,
      signal,
    );

    const pageRows = rows.slice(0, limit);
    const items = pageRows.map((row) =>
      toAgentSessionEntity({
        ...row,
        executionTarget: JSON.parse(row.executionTarget),
        titleIsManual: Boolean(row.titleIsManual),
      }),
    );
    const tail = pageRows.at(-1);
    return {
      items,
      ...(rows.length > limit && tail
        ? { nextCursor: encodeCursor(tail.lastActivityAt, tail.id) }
        : {}),
    };
  }
}

export const agentSessionService = new AgentSessionService();
