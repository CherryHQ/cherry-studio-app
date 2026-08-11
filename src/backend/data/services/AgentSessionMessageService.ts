import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/errors';
import {
  AGENT_SESSION_MESSAGES_DEFAULT_LIMIT,
  AGENT_SESSION_MESSAGES_MAX_LIMIT,
  type AgentSessionMessageEntity,
  type AgentSessionMessagesListQuery,
  type UpdateAgentSessionMessageDto,
} from '@cherrystudio/universal/data/api/schemas/agentSessionMessages';
import type { CursorPaginationResponse } from '@cherrystudio/universal/data/api/types';
import { and, desc, eq, lt, lte, or } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { agentSessionTable } from '@/backend/data/db/schemas/agentSession';
import {
  type AgentSessionMessageRow,
  agentSessionMessageTable,
} from '@/backend/data/db/schemas/agentSessionMessage';

import { asNumericKey, decodeListCursor, encodeCursor } from './utils/keysetCursor';
import { timestampToISO } from './utils/rowMappers';

function rowToEntity(row: AgentSessionMessageRow): AgentSessionMessageEntity {
  return {
    createdAt: timestampToISO(row.createdAt),
    data: row.data,
    id: row.id,
    messageSnapshot: row.messageSnapshot,
    modelId: row.modelId,
    role: row.role as AgentSessionMessageEntity['role'],
    runtimeResumeToken: row.runtimeResumeToken,
    searchableText: row.searchableText,
    sessionId: row.sessionId,
    stats: row.stats,
    status: row.status as AgentSessionMessageEntity['status'],
    updatedAt: timestampToISO(row.updatedAt),
  };
}

export class AgentSessionMessageService {
  /**
   * Resolved per call rather than injected once, so the instance holds no
   * reference to a particular host generation and a replaced host cannot leave
   * this singleton writing to a closed connection.
   */
  private get dbService() {
    return application.get('DbService');
  }

  private get db() {
    return this.dbService.getDb();
  }

  private async assertSessionExists(sessionId: string): Promise<void> {
    const [session] = await this.db
      .select({ id: agentSessionTable.id })
      .from(agentSessionTable)
      .where(eq(agentSessionTable.id, sessionId))
      .limit(1);
    if (!session) throw DataApiErrorFactory.notFound('Session', sessionId);
  }

  async listSessionMessages(
    sessionId: string,
    options: AgentSessionMessagesListQuery = {},
  ): Promise<CursorPaginationResponse<AgentSessionMessageEntity>> {
    await this.assertSessionExists(sessionId);
    const limit = Math.min(
      options.limit ?? AGENT_SESSION_MESSAGES_DEFAULT_LIMIT,
      AGENT_SESSION_MESSAGES_MAX_LIMIT,
    );
    const cursor = decodeListCursor(options.cursor, asNumericKey, 'agent-session-message');
    const [anchor] =
      !options.cursor && options.messageId
        ? await this.db
            .select({
              createdAt: agentSessionMessageTable.createdAt,
              id: agentSessionMessageTable.id,
            })
            .from(agentSessionMessageTable)
            .where(
              and(
                eq(agentSessionMessageTable.sessionId, sessionId),
                eq(agentSessionMessageTable.id, options.messageId),
              ),
            )
            .limit(1)
        : [];
    const boundary = cursor
      ? or(
          lt(agentSessionMessageTable.createdAt, cursor.key),
          and(
            eq(agentSessionMessageTable.createdAt, cursor.key),
            lt(agentSessionMessageTable.id, cursor.id),
          ),
        )
      : anchor
        ? or(
            lt(agentSessionMessageTable.createdAt, anchor.createdAt),
            and(
              eq(agentSessionMessageTable.createdAt, anchor.createdAt),
              lte(agentSessionMessageTable.id, anchor.id),
            ),
          )
        : undefined;
    const rows = await this.db
      .select()
      .from(agentSessionMessageTable)
      .where(and(eq(agentSessionMessageTable.sessionId, sessionId), boundary))
      .orderBy(desc(agentSessionMessageTable.createdAt), desc(agentSessionMessageTable.id))
      .limit(limit + 1);
    const hasNext = rows.length > limit;
    const page = rows.slice(0, limit);
    const tail = page.at(-1);
    return {
      items: page.map(rowToEntity),
      nextCursor: hasNext && tail ? encodeCursor(tail.createdAt, tail.id) : undefined,
    };
  }

  async getSessionMessage(
    sessionId: string,
    messageId: string,
  ): Promise<AgentSessionMessageEntity> {
    const [row] = await this.db
      .select()
      .from(agentSessionMessageTable)
      .where(
        and(
          eq(agentSessionMessageTable.sessionId, sessionId),
          eq(agentSessionMessageTable.id, messageId),
        ),
      )
      .limit(1);
    if (!row) throw DataApiErrorFactory.notFound('Message', messageId);
    return rowToEntity(row);
  }

  async updateSessionMessage(
    sessionId: string,
    messageId: string,
    dto: UpdateAgentSessionMessageDto,
  ): Promise<AgentSessionMessageEntity> {
    const row = await this.dbService.withWriteTx(async (tx) => {
      const updatedAt = Date.now();
      const [updated] = await tx
        .update(agentSessionMessageTable)
        .set({ data: dto.data, updatedAt })
        .where(
          and(
            eq(agentSessionMessageTable.sessionId, sessionId),
            eq(agentSessionMessageTable.id, messageId),
          ),
        )
        .returning();
      if (!updated) throw DataApiErrorFactory.notFound('Message', messageId);
      await tx
        .update(agentSessionTable)
        .set({ updatedAt })
        .where(eq(agentSessionTable.id, sessionId));
      return updated;
    });
    return rowToEntity(row);
  }

  async deleteSessionMessage(sessionId: string, messageId: string): Promise<void> {
    await this.assertSessionExists(sessionId);
    const rows = await this.dbService.withWriteTx((tx) =>
      tx
        .delete(agentSessionMessageTable)
        .where(
          and(
            eq(agentSessionMessageTable.sessionId, sessionId),
            eq(agentSessionMessageTable.id, messageId),
          ),
        )
        .returning({ id: agentSessionMessageTable.id }),
    );
    if (rows.length === 0) throw DataApiErrorFactory.notFound('Message', messageId);
  }
}

export const agentSessionMessageService = new AgentSessionMessageService();
