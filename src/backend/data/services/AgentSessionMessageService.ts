import { and, eq } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { agentSessionMessageTable, agentSessionTable } from '@/backend/data/db/schemas';
import type { AgentMessageView } from '@/shared/contracts/agent';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import {
  AGENT_SESSION_MESSAGES_DEFAULT_LIMIT,
  type ListAgentSessionMessagesQueryParams,
  ListAgentSessionMessagesQuerySchema,
} from '@/shared/data/api/schemas/agentSessionMessages';
import type { CursorPaginationResponse } from '@/shared/data/api/types';

import { toAgentMessageView } from './utils/agentSessionRows';
import { asNumericKey, decodeListCursor, encodeCursor, keysetOrdering } from './utils/keysetCursor';

/** SQL-only paginated reads for the durable linear transcript. */
export class AgentSessionMessageService {
  private get db() {
    return application.get('DbService').getDb();
  }

  async listByCursor(
    sessionId: string,
    params: ListAgentSessionMessagesQueryParams = {},
  ): Promise<CursorPaginationResponse<AgentMessageView>> {
    const query = ListAgentSessionMessagesQuerySchema.parse(params);
    const [session] = await this.db
      .select({ id: agentSessionTable.id })
      .from(agentSessionTable)
      .where(eq(agentSessionTable.id, sessionId))
      .limit(1);
    if (!session) {
      throw DataApiErrorFactory.notFound('AgentSession', sessionId);
    }

    const limit = query.limit ?? AGENT_SESSION_MESSAGES_DEFAULT_LIMIT;
    const cursor = decodeListCursor(query.cursor, asNumericKey, 'agent-session-messages');
    const ordering = keysetOrdering(
      agentSessionMessageTable.createdAt,
      agentSessionMessageTable.id,
      { major: 'desc', tie: 'desc' },
    );
    const rows = await this.db
      .select()
      .from(agentSessionMessageTable)
      .where(
        and(
          eq(agentSessionMessageTable.sessionId, sessionId),
          cursor ? ordering.where(cursor) : undefined,
        ),
      )
      .orderBy(...ordering.orderBy)
      .limit(limit + 1);

    const pageRows = rows.slice(0, limit);
    const items = pageRows.map(toAgentMessageView);
    const tail = pageRows.at(-1);
    return {
      items,
      ...(rows.length > limit && tail ? { nextCursor: encodeCursor(tail.createdAt, tail.id) } : {}),
    };
  }
}

export const agentSessionMessageService = new AgentSessionMessageService();
