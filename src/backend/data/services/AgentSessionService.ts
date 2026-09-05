import { and, eq } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { agentSessionTable } from '@/backend/data/db/schemas';
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
  ): Promise<CursorPaginationResponse<AgentSessionEntity>> {
    const query = ListAgentSessionsQuerySchema.parse(params);
    const limit = query.limit ?? DEFAULT_LIMIT;
    const cursor = decodeListCursor(query.cursor, asNumericKey, 'agent-sessions');
    const ordering = keysetOrdering(agentSessionTable.lastActivityAt, agentSessionTable.id, {
      major: 'desc',
      tie: 'desc',
    });
    const rows = await this.db
      .select()
      .from(agentSessionTable)
      .where(
        and(
          query.agentId ? eq(agentSessionTable.agentId, query.agentId) : undefined,
          cursor ? ordering.where(cursor) : undefined,
        ),
      )
      .orderBy(...ordering.orderBy)
      .limit(limit + 1);

    const pageRows = rows.slice(0, limit);
    const items = pageRows.map(toAgentSessionEntity);
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
