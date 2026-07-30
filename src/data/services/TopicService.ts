import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import type { OrderRequest } from '@/shared/data/api/schemas/_endpointHelpers';
import type {
  ActiveNodeResponse,
  CreateTopicDto,
  ListTopicsQuery,
  UpdateTopicDto,
} from '@/shared/data/api/schemas/topics';
import { type CursorPaginationResponse, DataApiErrorFactory } from '@/shared/data/api/types';
import type { Topic } from '@/shared/data/types/topic';
import type { DbService } from '../db/DbService';
import { messageTable, pinTable, type TopicRow, topicTable } from '../db/schemas';
import { createRootMessageTx } from './MessageService';
import type { PinService } from './PinService';
import type { TagService } from './TagService';
import { applyMoves, insertWithOrderKey } from './utils/orderKey';
import { timestampToISO } from './utils/rowMappers';

const defaultLimit = 50;
const maxLimit = 200;
const firstPageCursor: TopicCursor = { orderKey: '', section: 'pin' };

type DbOrTx = any;

type TopicCursor =
  | { orderKey: string; section: 'pin' }
  | { id: null; section: 'topic'; updatedAt: null }
  | { id: string; section: 'topic'; updatedAt: number };

export class TopicService {
  constructor(
    private readonly dbService: DbService,
    private readonly pinService: PinService,
    private readonly tagService: TagService,
  ) {}

  private get db() {
    return this.dbService.getDb();
  }

  async getById(id: string): Promise<Topic> {
    const [row] = await this.db
      .select()
      .from(topicTable)
      .where(and(eq(topicTable.id, id), isNull(topicTable.deletedAt)))
      .limit(1);

    if (!row) {
      throw DataApiErrorFactory.notFound('Topic', id);
    }

    return rowToTopic(row);
  }

  async ensureTraceId(topicId: string): Promise<string> {
    return await this.dbService.withWriteTx(async (tx) => {
      const [row] = await tx
        .select({ traceId: topicTable.traceId })
        .from(topicTable)
        .where(and(eq(topicTable.id, topicId), isNull(topicTable.deletedAt)))
        .limit(1);

      if (!row) {
        throw DataApiErrorFactory.notFound('Topic', topicId);
      }
      if (row.traceId) {
        return row.traceId;
      }

      const traceId = [...Crypto.getRandomBytes(16)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      await tx.update(topicTable).set({ traceId }).where(eq(topicTable.id, topicId));
      return traceId;
    });
  }

  async create(dto: CreateTopicDto): Promise<Topic> {
    const groupId = dto.groupId ?? null;

    const row = (await this.dbService.withWriteTx(async (tx) => {
      const topicRow = (await insertWithOrderKey(
        tx,
        topicTable,
        {
          activeNodeId: null,
          assistantId: dto.assistantId ?? null,
          groupId,
          name: dto.name ?? '',
        },
        {
          pkColumn: topicTable.id,
          scope: topicScopePredicate(groupId),
        },
      )) as TopicRow;

      await createRootMessageTx(tx, topicRow.id);

      return topicRow;
    })) as TopicRow;

    return rowToTopic(row);
  }

  async update(id: string, dto: UpdateTopicDto): Promise<Topic> {
    return await this.dbService.withWriteTx(async (tx) => {
      const [existing] = await tx
        .select({ id: topicTable.id })
        .from(topicTable)
        .where(and(eq(topicTable.id, id), isNull(topicTable.deletedAt)))
        .limit(1);

      if (!existing) {
        throw DataApiErrorFactory.notFound('Topic', id);
      }

      const updates: Partial<typeof topicTable.$inferInsert> = {};
      if (dto.assistantId !== undefined) {
        updates.assistantId = dto.assistantId;
      }
      if (dto.groupId !== undefined) {
        updates.groupId = dto.groupId;
      }
      if (dto.isNameManuallyEdited !== undefined) {
        updates.isNameManuallyEdited = dto.isNameManuallyEdited;
      }
      if (dto.name !== undefined) {
        updates.name = dto.name;
      }

      const [row] = await tx
        .update(topicTable)
        .set(updates)
        .where(eq(topicTable.id, id))
        .returning();
      if (!row) {
        throw DataApiErrorFactory.notFound('Topic', id);
      }

      return rowToTopic(row);
    });
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: readonly string[]): Promise<void> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return;
    }

    await Promise.all(uniqueIds.map((id) => this.getById(id)));

    await this.dbService.withWriteTx(async (tx) => {
      await tx.delete(messageTable).where(inArray(messageTable.topicId, uniqueIds));
      await this.tagService.purgeForEntitiesTx(tx, 'topic', uniqueIds);
      await this.pinService.purgeForEntitiesTx(tx, 'topic', uniqueIds);
      await tx.delete(topicTable).where(inArray(topicTable.id, uniqueIds));
    });
  }

  async setActiveNode(topicId: string, nodeId: string): Promise<ActiveNodeResponse> {
    await this.dbService.withWriteTx((tx) => this.setActiveNodeTx(tx, topicId, nodeId));
    return { activeNodeId: nodeId };
  }

  async setActiveNodeTx(
    tx: DbOrTx,
    topicId: string,
    nodeId: string,
    options: { assumeValid?: boolean } = {},
  ): Promise<void> {
    if (!options.assumeValid) {
      const [topic] = await tx
        .select({ id: topicTable.id })
        .from(topicTable)
        .where(and(eq(topicTable.id, topicId), isNull(topicTable.deletedAt)))
        .limit(1);

      if (!topic) {
        throw DataApiErrorFactory.notFound('Topic', topicId);
      }

      const [message] = await tx
        .select({ role: messageTable.role, topicId: messageTable.topicId })
        .from(messageTable)
        .where(and(eq(messageTable.id, nodeId), isNull(messageTable.deletedAt)))
        .limit(1);

      if (!message || message.topicId !== topicId) {
        throw DataApiErrorFactory.notFound('Message', nodeId);
      }

      if (message.role === 'root') {
        throw DataApiErrorFactory.invalidOperation(
          'set active node',
          'the virtual root cannot be the active node',
        );
      }
    }

    const updated = await tx
      .update(topicTable)
      .set({ activeNodeId: nodeId })
      .where(and(eq(topicTable.id, topicId), isNull(topicTable.deletedAt)))
      .returning({ id: topicTable.id });

    if (updated.length !== 1) {
      throw DataApiErrorFactory.notFound('Topic', topicId);
    }
  }

  async listByCursor(params: ListTopicsQuery = {}): Promise<CursorPaginationResponse<Topic>> {
    const limit = Math.min(params.limit ?? defaultLimit, maxLimit);
    const cursor = params.cursor ? decodeTopicCursor(params.cursor) : firstPageCursor;
    const search = buildSearchPredicate(params.q);
    const items: { pinOrderKey?: string; topic: Topic }[] = [];

    if (cursor.section === 'pin') {
      const pinAfter = cursor.orderKey ? gt(pinTable.orderKey, cursor.orderKey) : undefined;
      const pinRows = await this.db
        .select({ pinOrderKey: pinTable.orderKey, topic: topicTable })
        .from(topicTable)
        .innerJoin(
          pinTable,
          and(eq(pinTable.entityType, 'topic'), eq(pinTable.entityId, topicTable.id)),
        )
        .where(and(isNull(topicTable.deletedAt), pinAfter, search))
        .orderBy(asc(pinTable.orderKey), asc(topicTable.id))
        .limit(limit + 1);

      if (pinRows.length === 0 && cursor.orderKey !== '') {
        return { items: [], nextCursor: encodeTopicSectionStart() };
      }

      const hasMorePinned = pinRows.length > limit;
      for (const row of pinRows.slice(0, limit)) {
        items.push({ pinOrderKey: row.pinOrderKey, topic: rowToTopic(row.topic) });
      }

      if (hasMorePinned) {
        const last = items[items.length - 1];
        return {
          items: items.map((item) => item.topic),
          nextCursor: encodePinCursor(last?.pinOrderKey ?? ''),
        };
      }

      if (items.length >= limit) {
        return {
          items: items.map((item) => item.topic),
          nextCursor: encodeTopicSectionStart(),
        };
      }
    }

    const remaining = limit - items.length;
    const pinnedSubquery = this.db
      .select({ id: pinTable.entityId })
      .from(pinTable)
      .where(eq(pinTable.entityType, 'topic'));

    let topicAfter: SQL | undefined;
    if (cursor.section === 'topic' && cursor.updatedAt !== null) {
      topicAfter = or(
        lt(topicTable.updatedAt, cursor.updatedAt),
        and(eq(topicTable.updatedAt, cursor.updatedAt), gt(topicTable.id, cursor.id)),
      );
    }

    const topicRows = await this.db
      .select()
      .from(topicTable)
      .where(
        and(
          isNull(topicTable.deletedAt),
          notInArray(topicTable.id, pinnedSubquery),
          topicAfter,
          search,
        ),
      )
      .orderBy(desc(topicTable.updatedAt), asc(topicTable.id))
      .limit(remaining + 1);

    const hasMoreTopics = topicRows.length > remaining;
    for (const row of topicRows.slice(0, remaining)) {
      items.push({ topic: rowToTopic(row) });
    }

    const nextCursor =
      hasMoreTopics && topicRows[remaining - 1]
        ? encodeTopicCursor(topicRows[remaining - 1].updatedAt, topicRows[remaining - 1].id)
        : undefined;

    return { items: items.map((item) => item.topic), nextCursor };
  }

  async reorder(id: string, anchor: OrderRequest): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      const [target] = await tx
        .select({ groupId: topicTable.groupId })
        .from(topicTable)
        .where(and(eq(topicTable.id, id), isNull(topicTable.deletedAt)))
        .limit(1);

      if (!target) {
        throw DataApiErrorFactory.notFound('Topic', id);
      }

      await applyMoves(tx, topicTable, [{ anchor, id }], {
        pkColumn: topicTable.id,
        scope: topicScopePredicate(target.groupId),
      });
    });
  }

  async reorderBatch(moves: { anchor: OrderRequest; id: string }[]): Promise<void> {
    if (moves.length === 0) {
      return;
    }

    await this.dbService.withWriteTx(async (tx) => {
      const ids = moves.map((move) => move.id);
      const targets = await tx
        .select({ groupId: topicTable.groupId, id: topicTable.id })
        .from(topicTable)
        .where(and(inArray(topicTable.id, ids), isNull(topicTable.deletedAt)));

      if (targets.length !== ids.length) {
        const found = new Set(targets.map((target) => target.id));
        const missing = ids.find((id) => !found.has(id)) ?? ids[0];
        throw DataApiErrorFactory.notFound('Topic', missing);
      }

      const scopeValues = new Set(targets.map((target) => target.groupId));
      if (scopeValues.size > 1) {
        const scopeList = [...scopeValues].map((scope) => scope ?? '<null>').join(', ');
        throw DataApiErrorFactory.validation(
          { _root: [`reorderBatch: batch spans multiple groupId scopes (${scopeList})`] },
          `reorderBatch: batch spans multiple groupId scopes (${scopeList})`,
        );
      }

      const [scopeValue] = [...scopeValues];
      await applyMoves(tx, topicTable, moves, {
        pkColumn: topicTable.id,
        scope: topicScopePredicate(scopeValue ?? null),
      });
    });
  }
}

export function rowToTopic(row: TopicRow): Topic {
  return {
    ...(row.activeNodeId ? { activeNodeId: row.activeNodeId } : {}),
    ...(row.assistantId ? { assistantId: row.assistantId } : {}),
    createdAt: timestampToISO(row.createdAt),
    ...(row.groupId ? { groupId: row.groupId } : {}),
    id: row.id,
    isNameManuallyEdited: row.isNameManuallyEdited,
    name: row.name,
    orderKey: row.orderKey,
    ...(row.traceId ? { traceId: row.traceId } : {}),
    updatedAt: timestampToISO(row.updatedAt),
  };
}

function topicScopePredicate(groupId: null | string): SQL {
  return groupId === null ? isNull(topicTable.groupId) : eq(topicTable.groupId, groupId);
}

function buildSearchPredicate(query: string | undefined): SQL | undefined {
  const trimmed = query?.trim();
  if (!trimmed) {
    return undefined;
  }

  const pattern = `%${trimmed.replace(/[\\%_]/g, '\\$&')}%`;
  return sql`${topicTable.name} LIKE ${pattern} ESCAPE '\\'`;
}

function decodeTopicCursor(raw: string): TopicCursor {
  const outer = splitCursor(raw);
  if (!outer) {
    return firstPageCursor;
  }

  if (outer.key === 'pin') {
    return { orderKey: outer.id, section: 'pin' };
  }

  if (outer.key === 'topic') {
    if (outer.id === '') {
      return { id: null, section: 'topic', updatedAt: null };
    }

    const inner = splitCursor(outer.id);
    if (!inner?.id) {
      return firstPageCursor;
    }

    const updatedAt = Number(inner.key);
    if (!Number.isFinite(updatedAt)) {
      return firstPageCursor;
    }

    return { id: inner.id, section: 'topic', updatedAt };
  }

  return firstPageCursor;
}

function encodePinCursor(orderKey: string): string {
  return `pin:${orderKey}`;
}

function encodeTopicCursor(updatedAt: number, id: string): string {
  return `topic:${updatedAt}:${id}`;
}

function encodeTopicSectionStart(): string {
  return 'topic:';
}

function splitCursor(raw: string): { id: string; key: string } | null {
  const index = raw.indexOf(':');
  if (index < 0) {
    return null;
  }

  return {
    id: raw.slice(index + 1),
    key: raw.slice(0, index),
  };
}
