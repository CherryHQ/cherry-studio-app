import { and, asc, desc, eq, inArray, notExists, notInArray, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { application } from '@/backend/core/application/Application';
import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import { agentSessionMessageTable, agentSessionTable, agentTable } from '@/backend/data/db/schemas';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import {
  AGENT_SESSION_MESSAGES_DEFAULT_LIMIT,
  AgentTranscriptSelectionSchema,
  type AgentTranscriptSelection,
  type AgentSessionMessagePage,
  type ListAgentSessionMessagesQueryParams,
  ListAgentSessionMessagesQuerySchema,
  SaveAgentMessageTranslationSchema,
  type SaveAgentMessageTranslation,
} from '@/shared/data/api/schemas/agentSessionMessages';
import {
  readMessageTranslations,
  type MessageTranslations,
} from '@/shared/data/types/messageTranslation';
import { messageTranslationText } from '@/shared/utils/messageTranslation';
import { sha256HexOfText } from '@/shared/utils/sha256';

import {
  activeConversationCondition,
  withConversationSelections,
} from './utils/agentConversationPaths';
import {
  agentMessageViewColumns,
  type AgentMessageViewRow,
  toAgentSessionView,
  toReadableAgentMessageViews,
} from './utils/agentSessionRows';
import { asNumericKey, decodeListCursor, encodeCursor, keysetOrdering } from './utils/keysetCursor';

/** Durable transcript windows within a persisted path, with message-owned reading aids. */
export class AgentSessionMessageService {
  private get db() {
    return application.get('DbService').getDb();
  }

  /** Merge one completed language without replacing message parts or other languages. */
  async saveTranslation(
    sessionId: string,
    messageId: string,
    input: SaveAgentMessageTranslation,
  ): Promise<MessageTranslations> {
    SaveAgentMessageTranslationSchema.parse(input);
    const translations = await application.get('DbService').withWriteTx(async (tx) => {
      const [message] = await tx
        .select({
          data: agentSessionMessageTable.data,
          role: agentSessionMessageTable.role,
          status: agentSessionMessageTable.status,
        })
        .from(agentSessionMessageTable)
        .where(
          and(
            eq(agentSessionMessageTable.id, messageId),
            eq(agentSessionMessageTable.sessionId, sessionId),
          ),
        )
        .limit(1);
      if (!message) throw DataApiErrorFactory.notFound('AgentSessionMessage', messageId);
      const text = messageTranslationText(message.data.parts);
      if (
        message.role !== 'assistant' ||
        message.status !== 'success' ||
        !text ||
        sha256HexOfText(text) !== input.sourceHash
      )
        throw DataApiErrorFactory.conflict(
          'The translation source has changed',
          'AgentSessionMessage',
        );
      const previous = readMessageTranslations(message.data.translations);
      const translations: MessageTranslations = {
        sourceHash: input.sourceHash,
        results: {
          ...(previous?.sourceHash === input.sourceHash ? previous.results : {}),
          [input.language]: { content: input.content, createdAt: Date.now() },
        },
      };
      await tx
        .update(agentSessionMessageTable)
        .set({ data: { ...message.data, translations } })
        .where(eq(agentSessionMessageTable.id, messageId));
      return translations;
    });
    publishDataApiChanges([`/agent-sessions/${sessionId}/messages`]);
    return translations;
  }

  async listByCursor(
    sessionId: string,
    params: ListAgentSessionMessagesQueryParams = {},
  ): Promise<AgentSessionMessagePage> {
    const query = ListAgentSessionMessagesQuerySchema.parse(params);
    const [session] = await this.db
      .select({ id: agentSessionTable.id, state: agentSessionTable.conversationState })
      .from(agentSessionTable)
      .where(eq(agentSessionTable.id, sessionId))
      .limit(1);
    if (!session) {
      throw DataApiErrorFactory.notFound('AgentSession', sessionId);
    }

    if (
      query.pathId &&
      query.pathId !== 'root' &&
      !session.state?.paths.some((path) => path.id === query.pathId)
    )
      throw DataApiErrorFactory.notFound('ConversationPath', query.pathId);
    const state =
      session.state && query.pathId
        ? { ...session.state, activePathId: query.pathId }
        : session.state;
    const condition = and(
      activeConversationCondition(state),
      this.settledTurnFilter(query.settledOnly ?? false),
    );
    if (query.ids) {
      const rows = await this.db
        .select(agentMessageViewColumns)
        .from(agentSessionMessageTable)
        .where(
          and(
            eq(agentSessionMessageTable.sessionId, sessionId),
            inArray(agentSessionMessageTable.id, query.ids),
            condition,
          ),
        )
        .orderBy(desc(agentSessionMessageTable.createdAt), desc(agentSessionMessageTable.id));
      return {
        items: withConversationSelections(toReadableAgentMessageViews(rows), state),
      };
    }

    const limit = query.limit ?? AGENT_SESSION_MESSAGES_DEFAULT_LIMIT;
    if (query.aroundMessageId) {
      const page = await this.readAround(sessionId, query.aroundMessageId, limit, condition);
      return { ...page, items: withConversationSelections(page.items, state) };
    }

    const cursor = decodeListCursor(query.cursor, asNumericKey, 'agent-session-messages');
    const isNewer = query.direction === 'newer';
    if (isNewer && !cursor) {
      throw DataApiErrorFactory.validation({ cursor: ['Invalid message cursor'] });
    }
    const rows = await this.readRows(
      sessionId,
      limit + 1,
      isNewer ? 'asc' : 'desc',
      cursor,
      condition,
    );
    const selectedRows = rows.slice(0, limit);
    const pageRows = isNewer ? selectedRows.toReversed() : selectedRows;
    const head = pageRows[0];
    const tail = pageRows.at(-1);
    return {
      items: withConversationSelections(toReadableAgentMessageViews(pageRows), state),
      ...(tail && (isNewer ? cursor : rows.length > limit)
        ? { nextCursor: encodeCursor(tail.createdAt, tail.id) }
        : {}),
      ...(head && (isNewer ? rows.length > limit : cursor)
        ? { previousCursor: encodeCursor(head.createdAt, head.id) }
        : {}),
    };
  }

  /** One SELECT holds SQLite's read snapshot for both selection and session metadata. */
  async readSelection(sessionId: string, ids: string[]): Promise<AgentTranscriptSelection> {
    const input = AgentTranscriptSelectionSchema.parse({ ids });
    // Capture this generation before awaiting; never resolve a replacement host.
    const db = this.db;
    const rows = await db
      .select({
        session: agentSessionTable,
        message: agentSessionMessageTable,
        assistantName: agentTable.name,
      })
      .from(agentSessionTable)
      .leftJoin(agentTable, eq(agentTable.id, agentSessionTable.agentId))
      .leftJoin(
        agentSessionMessageTable,
        and(
          eq(agentSessionMessageTable.sessionId, agentSessionTable.id),
          inArray(agentSessionMessageTable.id, input.ids),
        ),
      )
      .where(eq(agentSessionTable.id, sessionId))
      .orderBy(asc(agentSessionMessageTable.createdAt), asc(agentSessionMessageTable.id));
    if (!rows[0]) throw DataApiErrorFactory.notFound('AgentSession', sessionId);
    const messages = rows.flatMap(({ message }) => (message ? [message] : []));
    if (messages.length !== new Set(input.ids).size)
      throw DataApiErrorFactory.notFound('AgentSessionMessage', sessionId);
    if (messages.some((message) => message.role === 'system'))
      throw DataApiErrorFactory.notFound('AgentSessionMessage', sessionId);
    if (messages.some((message) => message.status === 'pending' || message.status === 'streaming'))
      throw DataApiErrorFactory.validation({ ids: ['Only settled messages can be exported'] });
    return {
      assistantName: rows[0].assistantName ?? undefined,
      session: toAgentSessionView(rows[0].session),
      messages: withConversationSelections(
        toReadableAgentMessageViews(messages),
        rows[0].session.conversationState,
      ),
    };
  }

  private async readAround(sessionId: string, messageId: string, limit: number, condition?: SQL) {
    const [target] = await this.db
      .select(agentMessageViewColumns)
      .from(agentSessionMessageTable)
      .where(
        and(
          eq(agentSessionMessageTable.sessionId, sessionId),
          eq(agentSessionMessageTable.id, messageId),
          condition,
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
      this.readRows(sessionId, olderCount + 1, 'desc', boundary, condition),
      this.readRows(sessionId, newerCount + 1, 'asc', boundary, condition),
    ]);
    const rows = [
      ...newer.slice(0, newerCount).toReversed(),
      target,
      ...older.slice(0, olderCount),
    ];
    const head = rows[0];
    const tail = rows[rows.length - 1];
    return {
      items: toReadableAgentMessageViews(rows),
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
    condition?: SQL,
  ): Promise<AgentMessageViewRow[]> {
    const ordering = keysetOrdering(
      agentSessionMessageTable.createdAt,
      agentSessionMessageTable.id,
      { major: direction, tie: direction },
    );
    return this.db
      .select(agentMessageViewColumns)
      .from(agentSessionMessageTable)
      .where(
        and(
          eq(agentSessionMessageTable.sessionId, sessionId),
          cursor ? ordering.where(cursor) : undefined,
          condition,
        ),
      )
      .orderBy(...ordering.orderBy)
      .limit(limit);
  }

  private settledTurnFilter(settledOnly: boolean) {
    if (!settledOnly) return undefined;
    const unsettled = alias(agentSessionMessageTable, 'unsettled_turn');
    return and(
      notInArray(agentSessionMessageTable.status, ['pending', 'streaming']),
      notExists(
        this.db
          .select({ id: unsettled.id })
          .from(unsettled)
          .where(
            and(
              eq(unsettled.sessionId, agentSessionMessageTable.sessionId),
              eq(unsettled.turnId, agentSessionMessageTable.turnId),
              eq(unsettled.role, 'assistant'),
              inArray(unsettled.status, ['pending', 'streaming']),
            ),
          ),
      ),
    );
  }
}

export const agentSessionMessageService = new AgentSessionMessageService();
