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

type SessionCatalogRow = Omit<AgentSessionRow, 'isNameManuallyEdited'> & {
  isNameManuallyEdited: number;
  hasChildren: number;
};
type SessionListRow = SessionCatalogRow & {
  catalogActivityAt: number;
};

const sessionColumns = sql`agent_session.id, agent_id AS "agentId", name,
  is_name_manually_edited AS "isNameManuallyEdited",
  last_activity_at AS "lastActivityAt", created_at AS "createdAt", updated_at AS "updatedAt",
  runtime_revision AS "runtimeRevision", active_node_id AS "activeNodeId",
  forked_from_session_id AS "forkedFromSessionId", fork_boundary_message_id AS "forkBoundaryMessageId",
  workspace_folder_id AS "workspaceFolderId"`;
const hasChildren = sql`EXISTS (
  SELECT 1 FROM agent_session AS child
  WHERE child.forked_from_session_id = agent_session.id
)`;

function toCatalogEntity(row: SessionCatalogRow): AgentSessionEntity {
  return {
    ...toAgentSessionEntity({ ...row, isNameManuallyEdited: Boolean(row.isNameManuallyEdited) }),
    hasChildren: Boolean(row.hasChildren),
  };
}

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

  /** One metadata read restores the path to a selected conversation, without opening transcripts. */
  async getPath(id: string, signal?: AbortSignal): Promise<AgentSessionEntity[]> {
    const rows = await readSqliteRows<SessionCatalogRow>(
      application.get('DbService').getSqlite(),
      sql`
        WITH RECURSIVE ancestors(id, depth) AS (
          SELECT id, 0 FROM agent_session WHERE id = ${id}
          UNION ALL
          SELECT parent.id, ancestors.depth + 1
          FROM ancestors
          JOIN agent_session AS child ON child.id = ancestors.id
          JOIN agent_session AS parent ON parent.id = child.forked_from_session_id
        )
        SELECT ${sessionColumns}, ${hasChildren} AS "hasChildren"
        FROM agent_session JOIN ancestors ON ancestors.id = agent_session.id
        ORDER BY ancestors.depth DESC
      `,
      signal,
    );
    if (!rows.length) throw DataApiErrorFactory.notFound('AgentSession', id);
    return rows.map(toCatalogEntity);
  }

  async listByCursor(
    params: ListAgentSessionsQueryParams = {},
    signal?: AbortSignal,
  ): Promise<CursorPaginationResponse<AgentSessionEntity>> {
    const query = ListAgentSessionsQuerySchema.parse(params);
    const limit = query.limit ?? DEFAULT_LIMIT;
    const cursor = decodeListCursor(query.cursor, asNumericKey, 'agent-sessions');
    const grouped = query.groupBy === 'root';
    const activity = grouped ? sql`family.activity_at` : agentSessionTable.lastActivityAt;
    const sortKey = query.parentSessionId ? agentSessionTable.createdAt : activity;
    const ordering = keysetOrdering(sortKey, agentSessionTable.id, {
      major: query.parentSessionId ? 'asc' : 'desc',
      tie: query.parentSessionId ? 'asc' : 'desc',
    });
    const condition = and(
      query.agentId ? eq(agentSessionTable.agentId, query.agentId) : undefined,
      grouped ? sql`${agentSessionTable.forkedFromSessionId} IS NULL` : undefined,
      query.parentSessionId
        ? eq(agentSessionTable.forkedFromSessionId, query.parentSessionId)
        : undefined,
      query.q
        ? sql`${agentSessionTable.name} LIKE ${`%${query.q.replace(/[\\%_]/g, '\\$&')}%`} ESCAPE '\\'`
        : undefined,
      cursor ? ordering.where(cursor) : undefined,
    );
    const rows = await readSqliteRows<SessionListRow>(
      application.get('DbService').getSqlite(),
      sql`
        ${grouped ? sessionRoots : sql``}
        SELECT ${sessionColumns}, ${sortKey} AS "catalogActivityAt", ${hasChildren} AS "hasChildren"
        FROM ${agentSessionTable}
        ${
          grouped
            ? sql`JOIN (
          SELECT root_id, max(member.last_activity_at) AS activity_at
          FROM session_roots JOIN agent_session AS member ON member.id = session_roots.id
          GROUP BY root_id
        ) AS family ON family.root_id = agent_session.id`
            : sql``
        }
        WHERE ${condition ?? sql`1 = 1`}
        ORDER BY ${sql.join(ordering.orderBy, sql`, `)}
        LIMIT ${limit + 1}
      `,
      signal,
    );

    const pageRows = rows.slice(0, limit);
    const items = pageRows.map(toCatalogEntity);
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
