import { and, eq } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { agentSessionMessageTable, agentSessionTable } from '@/backend/data/db/schemas';
import type { AgentSessionMessageRow } from '@/backend/data/db/schemas/agentSessionMessage';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import {
  AGENT_SESSION_MESSAGES_DEFAULT_LIMIT,
  type AgentSessionMessagePage,
  type ListAgentSessionMessagesQueryParams,
  ListAgentSessionMessagesQuerySchema,
} from '@/shared/data/api/schemas/agentSessionMessages';

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
  ): Promise<AgentSessionMessagePage> {
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
    if (query.aroundMessageId) {
      return this.readAround(sessionId, query.aroundMessageId, limit);
    }

    const cursor = decodeListCursor(query.cursor, asNumericKey, 'agent-session-messages');
    const isNewer = query.direction === 'newer';
    if (isNewer && !cursor) {
      throw DataApiErrorFactory.validation({ cursor: ['Invalid message cursor'] });
    }
    const rows = await this.readRows(sessionId, limit + 1, isNewer ? 'asc' : 'desc', cursor);
    const selectedRows = rows.slice(0, limit);
    const pageRows = isNewer ? selectedRows.toReversed() : selectedRows;
    const head = pageRows[0];
    const tail = pageRows.at(-1);
    return {
      items: pageRows.map(toAgentMessageView),
      ...(tail && (isNewer ? cursor : rows.length > limit)
        ? { nextCursor: encodeCursor(tail.createdAt, tail.id) }
        : {}),
      ...(head && (isNewer ? rows.length > limit : cursor)
        ? { previousCursor: encodeCursor(head.createdAt, head.id) }
        : {}),
    };
  }

  private async readAround(sessionId: string, messageId: string, limit: number) {
    const [target] = await this.db
      .select()
      .from(agentSessionMessageTable)
      .where(
        and(
          eq(agentSessionMessageTable.sessionId, sessionId),
          eq(agentSessionMessageTable.id, messageId),
        ),
      )
      .limit(1);
    if (!target) {
      throw DataApiErrorFactory.notFound('AgentSessionMessage', messageId);
    }

    const boundary = { key: target.createdAt, id: target.id };
    const olderCount = Math.floor((limit - 1) / 2);
    const newerCount = limit - 1 - olderCount;
    const [older, newer] = await Promise.all([
      this.readRows(sessionId, olderCount + 1, 'desc', boundary),
      this.readRows(sessionId, newerCount + 1, 'asc', boundary),
    ]);
    const rows = [
      ...newer.slice(0, newerCount).toReversed(),
      target,
      ...older.slice(0, olderCount),
    ];
    const head = rows[0];
    const tail = rows[rows.length - 1];
    return {
      items: rows.map(toAgentMessageView),
      ...(older.length > olderCount ? { nextCursor: encodeCursor(tail.createdAt, tail.id) } : {}),
      ...(newer.length > newerCount
        ? { previousCursor: encodeCursor(head.createdAt, head.id) }
        : {}),
    };
  }

  private readRows(
    sessionId: string,
    limit: number,
    direction: 'asc' | 'desc',
    cursor: { key: number; id: string } | null,
  ): Promise<AgentSessionMessageRow[]> {
    const ordering = keysetOrdering(
      agentSessionMessageTable.createdAt,
      agentSessionMessageTable.id,
      { major: direction, tie: direction },
    );
    return this.db
      .select()
      .from(agentSessionMessageTable)
      .where(
        and(
          eq(agentSessionMessageTable.sessionId, sessionId),
          cursor ? ordering.where(cursor) : undefined,
        ),
      )
      .orderBy(...ordering.orderBy)
      .limit(limit);
  }
}

export const agentSessionMessageService = new AgentSessionMessageService();
