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

type SessionListRow = Omit<AgentSessionRow, 'isNameManuallyEdited'> & {
  isNameManuallyEdited: number;
  forkCount: number | null;
  catalogActivityAt: number;
};

const sessionRoots = sql`WITH RECURSIVE session_roots(id, root_id) AS (
  SELECT id, id FROM agent_session WHERE forked_from_session_id IS NULL
  UNION ALL
  SELECT child.id, parent.root_id FROM agent_session AS child
  JOIN session_roots AS parent ON child.forked_from_session_id = parent.id
)`;

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
    const grouped = query.groupBy === 'root';
    const needsRoots = grouped || Boolean(query.rootSessionId);
    const activity = grouped ? sql`family.activity_at` : agentSessionTable.lastActivityAt;
    const ordering = keysetOrdering(activity, agentSessionTable.id, {
      major: 'desc',
      tie: 'desc',
    });
    const condition = and(
      query.agentId ? eq(agentSessionTable.agentId, query.agentId) : undefined,
      grouped ? sql`${agentSessionTable.id} = session_roots.root_id` : undefined,
      query.rootSessionId
        ? sql`session_roots.root_id = ${query.rootSessionId}
        AND ${agentSessionTable.id} <> ${query.rootSessionId}`
        : undefined,
      query.q
        ? sql`${agentSessionTable.name} LIKE ${`%${query.q.replace(/[\\%_]/g, '\\$&')}%`} ESCAPE '\\'`
        : undefined,
      cursor ? ordering.where(cursor) : undefined,
    );
    const rows = await readSqliteRows<SessionListRow>(
      application.get('DbService').getSqlite(),
      sql`
        ${needsRoots ? sessionRoots : sql``}
        SELECT agent_session.id, agent_id AS "agentId", name,
          is_name_manually_edited AS "isNameManuallyEdited",
          last_activity_at AS "lastActivityAt", created_at AS "createdAt", updated_at AS "updatedAt",
          runtime_revision AS "runtimeRevision", ${activity} AS "catalogActivityAt",
          ${grouped ? sql`family.fork_count` : sql`NULL`} AS "forkCount",
          forked_from_session_id AS "forkedFromSessionId", fork_boundary_message_id AS "forkBoundaryMessageId", workspace_folder_id AS "workspaceFolderId"
        FROM ${agentSessionTable}
        ${needsRoots ? sql`JOIN session_roots ON session_roots.id = agent_session.id` : sql``}
        ${
          grouped
            ? sql`JOIN (
          SELECT root_id, count(*) - 1 AS fork_count, max(member.last_activity_at) AS activity_at
          FROM session_roots JOIN agent_session AS member ON member.id = session_roots.id
          GROUP BY root_id
        ) AS family ON family.root_id = session_roots.root_id`
            : sql``
        }
        WHERE ${condition ?? sql`1 = 1`}
        ORDER BY ${sql.join(ordering.orderBy, sql`, `)}
        LIMIT ${limit + 1}
      `,
      signal,
    );

    const pageRows = rows.slice(0, limit);
    const items = pageRows.map((row) => ({
      ...toAgentSessionEntity({
        ...row,
        isNameManuallyEdited: Boolean(row.isNameManuallyEdited),
      }),
      ...(row.forkCount !== null ? { forkCount: row.forkCount } : {}),
    }));
    const tail = pageRows.at(-1);
    return {
      items,
      ...(rows.length > limit && tail
        ? { nextCursor: encodeCursor(tail.catalogActivityAt, tail.id) }
        : {}),
    };
  }
}

export const agentSessionService = new AgentSessionService();
