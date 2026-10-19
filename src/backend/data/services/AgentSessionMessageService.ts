import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  notExists,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { application } from '@/backend/core/application/Application';
import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import { agentSessionMessageTable, agentSessionTable, agentTable } from '@/backend/data/db/schemas';
import type { AgentMessageSibling, AgentMessageView } from '@/shared/contracts/agent';
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

import { messagePathIdsSql } from './utils/agentMessageTree';
import {
  agentMessageViewColumns,
  type AgentMessageViewRow,
  toAgentSessionView,
  toReadableAgentMessageViews,
} from './utils/agentSessionRows';
import { asNumericKey, decodeListCursor, encodeCursor, keysetOrdering } from './utils/keysetCursor';

/** Durable transcript reads and message-owned reading aids. */
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
      .select({ id: agentSessionTable.id })
      .from(agentSessionTable)
      .where(eq(agentSessionTable.id, sessionId))
      .limit(1);
    if (!session) {
      throw DataApiErrorFactory.notFound('AgentSession', sessionId);
    }

    if (query.ids) {
      const rows = await this.db
        .select(agentMessageViewColumns)
        .from(agentSessionMessageTable)
        .where(
          and(
            eq(agentSessionMessageTable.sessionId, sessionId),
            inArray(agentSessionMessageTable.id, query.ids),
          ),
        )
        .orderBy(desc(agentSessionMessageTable.createdAt), desc(agentSessionMessageTable.id));
      return { items: await this.withSiblings(sessionId, toReadableAgentMessageViews(rows)) };
    }

    const limit = query.limit ?? AGENT_SESSION_MESSAGES_DEFAULT_LIMIT;
    if (query.aroundMessageId) {
      return this.readAround(sessionId, query.aroundMessageId, limit, query.settledOnly);
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
      query.settledOnly,
    );
    const selectedRows = rows.slice(0, limit);
    const pageRows = isNewer ? selectedRows.toReversed() : selectedRows;
    const head = pageRows[0];
    const tail = pageRows.at(-1);
    return {
      items: await this.withSiblings(sessionId, toReadableAgentMessageViews(pageRows)),
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
      messages: toReadableAgentMessageViews(messages),
    };
  }

  private async readAround(
    sessionId: string,
    messageId: string,
    limit: number,
    settledOnly = false,
  ) {
    const readTarget = (candidates: SQL) =>
      this.db
        .select(agentMessageViewColumns)
        .from(agentSessionMessageTable)
        .where(
          and(
            eq(agentSessionMessageTable.sessionId, sessionId),
            candidates,
            this.onSelectedPath(sessionId),
            this.settledTurnFilter(settledOnly),
          ),
        )
        .orderBy(desc(agentSessionMessageTable.createdAt), desc(agentSessionMessageTable.id))
        .limit(1);
    let [target] = await readTarget(eq(agentSessionMessageTable.id, messageId));
    // Selecting another answer above it takes the message out of the transcript; read around its
    // nearest ancestor still shown, where the branches part.
    if (!target && !(await this.isOnSelectedPath(sessionId, messageId)))
      [target] = await readTarget(
        sql`${agentSessionMessageTable.id} IN (${messagePathIdsSql(sessionId, messageId)})`,
      );
    if (!target) {
      throw DataApiErrorFactory.notFound('AgentSessionMessage', messageId);
    }

    const boundary = { key: target.createdAt, id: target.id };
    const olderCount = Math.floor((limit - 1) / 2);
    const newerCount = limit - 1 - olderCount;
    const [older, newer] = await Promise.all([
      this.readRows(sessionId, olderCount + 1, 'desc', boundary, settledOnly),
      this.readRows(sessionId, newerCount + 1, 'asc', boundary, settledOnly),
    ]);
    const rows = [
      ...newer.slice(0, newerCount).toReversed(),
      target,
      ...older.slice(0, olderCount),
    ];
    const head = rows[0];
    const tail = rows[rows.length - 1];
    return {
      items: await this.withSiblings(sessionId, toReadableAgentMessageViews(rows)),
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
    settledOnly = false,
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
          this.onSelectedPath(sessionId),
          cursor ? ordering.where(cursor) : undefined,
          this.settledTurnFilter(settledOnly),
        ),
      )
      .orderBy(...ordering.orderBy)
      .limit(limit);
  }

  private async isOnSelectedPath(sessionId: string, messageId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: agentSessionMessageTable.id })
      .from(agentSessionMessageTable)
      .where(
        and(
          eq(agentSessionMessageTable.id, messageId),
          eq(agentSessionMessageTable.sessionId, sessionId),
          this.onSelectedPath(sessionId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /** The transcript is the selected leaf's ancestor chain (docs/references/agent/agent-persistence.md). */
  private onSelectedPath(sessionId: string) {
    return sql`${agentSessionMessageTable.id} IN (${messagePathIdsSql(sessionId)})`;
  }

  /** Attach every alternative at each branch point the page passes through. */
  private async withSiblings(
    sessionId: string,
    items: AgentMessageView[],
  ): Promise<AgentMessageView[]> {
    if (!items.length) return items;
    const parents = [...new Set(items.flatMap((item) => (item.parentId ? [item.parentId] : [])))];
    const rows = await this.db
      .select({
        id: agentSessionMessageTable.id,
        parentId: agentSessionMessageTable.parentId,
        modelId: agentSessionMessageTable.modelId,
        status: agentSessionMessageTable.status,
        siblingsGroupId: agentSessionMessageTable.siblingsGroupId,
      })
      .from(agentSessionMessageTable)
      // Parent ids already belong to this Session; a Session filter beside them lets SQLite pick
      // the Session index and scan the whole transcript instead of the parent index.
      .where(
        or(
          parents.length ? inArray(agentSessionMessageTable.parentId, parents) : undefined,
          items.some((item) => item.parentId === null)
            ? and(
                isNull(agentSessionMessageTable.parentId),
                eq(agentSessionMessageTable.sessionId, sessionId),
              )
            : undefined,
        ),
      )
      .orderBy(asc(agentSessionMessageTable.createdAt), asc(agentSessionMessageTable.id));
    const children = new Map<string | null, AgentMessageSibling[]>();
    for (const { parentId, ...sibling } of rows) {
      const list = children.get(parentId) ?? [];
      list.push(sibling as AgentMessageSibling);
      children.set(parentId, list);
    }
    return items.map((item) => {
      const siblings = item.parentId === undefined ? undefined : children.get(item.parentId);
      return siblings && siblings.length > 1 ? { ...item, siblings } : item;
    });
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
