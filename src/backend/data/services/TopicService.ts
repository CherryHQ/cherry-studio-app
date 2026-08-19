import type { OrderRequest } from '@cherrystudio/universal/data/api/schemas/_endpointHelpers';
import type {
  ActiveNodeResponse,
  CreateTopicDto,
  DeleteTopicsResult,
  DuplicateTopicDto,
  ListTopicsQuery,
  TopicListItem,
  UpdateTopicDto,
} from '@cherrystudio/universal/data/api/schemas/topics';
import {
  type CursorPaginationResponse,
  DataApiErrorFactory,
} from '@cherrystudio/universal/data/api/types';
import type { MessageStats } from '@cherrystudio/universal/data/types/message';
import type { Topic } from '@cherrystudio/universal/data/types/topic';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import * as Crypto from 'expo-crypto';

import { application } from '@/backend/core/application/Application';

import {
  assistantTable,
  chatMessageFileRefTable,
  type MessageRow,
  messageTable,
  pinTable,
  type TopicRow,
  topicTable,
} from '../db/schemas';
import { registerDataService } from './dataServiceRegistry';
import { createRootMessageTx } from './MessageService';
import { pinService } from './PinService';
import { applyMoves, insertWithOrderKey } from './utils/orderKey';
import { timestampToISO } from './utils/rowMappers';

const defaultLimit = 50;
const maxLimit = 200;
const sqliteInArrayChunk = 500;
const sqliteInsertChunk = 100;

type DbOrTx = any;
type TopicCursor =
  | { id: string; orderKey: string; section: 'pin' }
  | { id: string; orderKey: string; section: 'entity' }
  | { id: null; orderKey: null; section: 'entity' };

const firstPageCursor: TopicCursor = { id: '', orderKey: '', section: 'pin' };

export class TopicService {
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

  get(id: string): Promise<Topic> {
    return this.getById(id);
  }

  async getLatestUpdated(): Promise<Topic | null> {
    const [row] = await this.db
      .select()
      .from(topicTable)
      .where(isNull(topicTable.deletedAt))
      .orderBy(desc(topicTable.updatedAt), asc(topicTable.id))
      .limit(1);
    return row ? rowToTopic(row) : null;
  }

  async ensureTraceId(topicId: string): Promise<string> {
    return this.dbService.withWriteTx(async (tx) => {
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
    const row = (await this.dbService.withWriteTx(async (tx) => {
      const topicRow = (await insertWithOrderKey(
        tx,
        topicTable,
        {
          activeNodeId: null,
          assistantId: dto.assistantId,
          name: dto.name,
        },
        {
          pkColumn: topicTable.id,
          position: 'first',
          scope: isNull(topicTable.deletedAt),
        },
      )) as TopicRow;
      await createRootMessageTx(tx, topicRow.id);
      return topicRow;
    })) as TopicRow;
    return rowToTopic(row);
  }

  async duplicate(sourceTopicId: string, dto: DuplicateTopicDto): Promise<Topic> {
    return this.dbService.withWriteTx(async (tx) => {
      const [sourceTopic] = await tx
        .select()
        .from(topicTable)
        .where(and(eq(topicTable.id, sourceTopicId), isNull(topicTable.deletedAt)))
        .limit(1);
      if (!sourceTopic) {
        throw DataApiErrorFactory.notFound('Topic', sourceTopicId);
      }

      const sourcePath = await getPathRowsToNodeTx(tx, dto.nodeId, sourceTopicId);
      const newTopic = (await insertWithOrderKey(
        tx,
        topicTable,
        {
          activeNodeId: null,
          assistantId: sourceTopic.assistantId,
          isNameManuallyEdited: dto.name !== undefined ? true : sourceTopic.isNameManuallyEdited,
          name: dto.name ?? sourceTopic.name,
        },
        {
          pkColumn: topicTable.id,
          position: 'first',
          scope: isNull(topicTable.deletedAt),
        },
      )) as TopicRow;
      const destinationRootId = await createRootMessageTx(tx, newTopic.id);
      const { activeNodeId, sourceIdMap } = await copyPathRowsTx(
        tx,
        sourcePath,
        newTopic.id,
        destinationRootId,
      );
      await copyChatMessageFileRefsTx(tx, sourceIdMap);

      const [updated] = await tx
        .update(topicTable)
        .set({ activeNodeId })
        .where(eq(topicTable.id, newTopic.id))
        .returning();
      return rowToTopic(updated);
    });
  }

  async update(id: string, dto: UpdateTopicDto): Promise<Topic> {
    return this.dbService.withWriteTx(async (tx) => {
      const [existing] = await tx
        .select({ id: topicTable.id })
        .from(topicTable)
        .where(and(eq(topicTable.id, id), isNull(topicTable.deletedAt)))
        .limit(1);
      if (!existing) {
        throw DataApiErrorFactory.notFound('Topic', id);
      }

      const updates: Partial<typeof topicTable.$inferInsert> = {};
      if (dto.name !== undefined) {
        updates.name = dto.name;
        updates.isNameManuallyEdited = dto.isNameManuallyEdited ?? true;
      } else if (dto.isNameManuallyEdited !== undefined) {
        updates.isNameManuallyEdited = dto.isNameManuallyEdited;
      }
      if (dto.assistantId !== undefined) {
        if (dto.assistantId !== null) {
          await assertActiveAssistantTx(tx, dto.assistantId);
        }
        updates.assistantId = dto.assistantId;
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
    await this.dbService.withWriteTx((tx) => this.deleteManyByIdsTx(tx, [id], true));
  }

  async deleteByIds(ids: readonly string[]): Promise<DeleteTopicsResult> {
    if (ids.length === 0) {
      return { deletedCount: 0, deletedIds: [] };
    }
    const deletedIds = await this.dbService.withWriteTx((tx) =>
      this.deleteManyByIdsTx(tx, ids, true),
    );
    return { deletedCount: deletedIds.length, deletedIds };
  }

  async deleteMany(ids: readonly string[]): Promise<void> {
    await this.deleteByIds(ids);
  }

  removeMany(ids: readonly string[]): Promise<void> {
    return this.deleteMany(ids);
  }

  /**
   * The ids `deleteByAssistantId` would cascade over, readable before it runs.
   *
   * Exists because that method discovers its own set inside the write
   * transaction, and the scope coordinator has to cancel the work under each
   * topic *before* any transaction opens. A topic created between this read and
   * the delete is missed; that window is sub-millisecond and covered by the
   * write-path guards, whereas cancelling inside the transaction would deadlock
   * the drain against it.
   */
  async listIdsByAssistantId(assistantId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: topicTable.id })
      .from(topicTable)
      .where(and(eq(topicTable.assistantId, assistantId), isNull(topicTable.deletedAt)));
    return rows.map((row: { id: string }) => row.id);
  }

  async deleteByAssistantId(assistantId: string): Promise<DeleteTopicsResult> {
    const deletedIds = await this.dbService.withWriteTx((tx) =>
      this.deleteByAssistantIdTx(tx, assistantId),
    );
    return { deletedCount: deletedIds.length, deletedIds };
  }

  async deleteByAssistantIdTx(
    tx: DbOrTx,
    assistantId: string,
    options: { validateAssistant?: boolean } = {},
  ): Promise<string[]> {
    if (options.validateAssistant ?? true) {
      await assertActiveAssistantTx(tx, assistantId);
    }

    const rows = await tx
      .select({ id: topicTable.id })
      .from(topicTable)
      .where(and(eq(topicTable.assistantId, assistantId), isNull(topicTable.deletedAt)));
    return this.deleteManyByIdsTx(
      tx,
      rows.map((row: { id: string }) => row.id),
      false,
    );
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
          'set active node to the virtual root',
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

  async clearActiveNodeTx(tx: DbOrTx, topicId: string): Promise<void> {
    const updated = await tx
      .update(topicTable)
      .set({ activeNodeId: null })
      .where(and(eq(topicTable.id, topicId), isNull(topicTable.deletedAt)))
      .returning({ id: topicTable.id });
    if (updated.length !== 1) {
      throw DataApiErrorFactory.notFound('Topic', topicId);
    }
  }

  async listByCursor(
    query: ListTopicsQuery = {},
  ): Promise<CursorPaginationResponse<TopicListItem>> {
    const limit = Math.min(query.limit ?? defaultLimit, maxLimit);
    const cursor = decodeTopicCursor(query.cursor);
    const search = buildSearchPredicate(query.q);
    const items: Array<{ pinOrderKey?: string; topic: TopicListItem }> = [];

    if (cursor.section === 'pin') {
      const pinAfter = cursor.orderKey
        ? or(
            gt(pinTable.orderKey, cursor.orderKey),
            and(eq(pinTable.orderKey, cursor.orderKey), gt(topicTable.id, cursor.id)),
          )
        : undefined;
      const rows = await this.db
        .select({
          latestMessageText: messageTable.searchableText,
          pinOrderKey: pinTable.orderKey,
          topic: topicTable,
        })
        .from(topicTable)
        .innerJoin(
          pinTable,
          and(eq(pinTable.entityType, 'topic'), eq(pinTable.entityId, topicTable.id)),
        )
        .leftJoin(
          messageTable,
          and(eq(messageTable.id, topicTable.activeNodeId), isNull(messageTable.deletedAt)),
        )
        .where(and(isNull(topicTable.deletedAt), pinAfter, search))
        .orderBy(asc(pinTable.orderKey), asc(topicTable.id))
        .limit(limit + 1);

      if (rows.length === 0 && cursor.orderKey !== '') {
        return { items: [], nextCursor: encodeEntitySectionStart() };
      }
      for (const row of rows.slice(0, limit)) {
        items.push({
          pinOrderKey: row.pinOrderKey,
          topic: rowToTopicListItem(row.topic, row.latestMessageText),
        });
      }
      if (rows.length > limit) {
        const last = items.at(-1);
        return {
          items: items.map((item) => item.topic),
          nextCursor: encodePinCursor(last?.pinOrderKey ?? '', last?.topic.id ?? ''),
        };
      }
      if (items.length >= limit) {
        return {
          items: items.map((item) => item.topic),
          nextCursor: encodeEntitySectionStart(),
        };
      }
    }

    const remaining = limit - items.length;
    const pinnedSubquery = this.db
      .select({ id: pinTable.entityId })
      .from(pinTable)
      .where(eq(pinTable.entityType, 'topic'));
    const entityAfter =
      cursor.section === 'entity' && cursor.orderKey !== null
        ? or(
            gt(topicTable.orderKey, cursor.orderKey),
            and(eq(topicTable.orderKey, cursor.orderKey), gt(topicTable.id, cursor.id)),
          )
        : undefined;
    const rows = await this.db
      .select({ latestMessageText: messageTable.searchableText, topic: topicTable })
      .from(topicTable)
      .leftJoin(
        messageTable,
        and(eq(messageTable.id, topicTable.activeNodeId), isNull(messageTable.deletedAt)),
      )
      .where(
        and(
          isNull(topicTable.deletedAt),
          notInArray(topicTable.id, pinnedSubquery),
          entityAfter,
          search,
        ),
      )
      .orderBy(asc(topicTable.orderKey), asc(topicTable.id))
      .limit(remaining + 1);
    for (const row of rows.slice(0, remaining)) {
      items.push({ topic: rowToTopicListItem(row.topic, row.latestMessageText) });
    }
    const last = rows[remaining - 1];
    return {
      items: items.map((item) => item.topic),
      ...(rows.length > remaining && last
        ? { nextCursor: encodeEntityCursor(last.topic.orderKey, last.topic.id) }
        : {}),
    };
  }

  listPage(query?: ListTopicsQuery): Promise<CursorPaginationResponse<TopicListItem>> {
    return this.listByCursor(query);
  }

  async reorder(id: string, anchor: OrderRequest): Promise<void> {
    await this.dbService.withWriteTx((tx) =>
      applyMoves(tx, topicTable, [{ anchor, id }], {
        pkColumn: topicTable.id,
        scope: isNull(topicTable.deletedAt),
      }),
    );
  }

  async reorderBatch(moves: { anchor: OrderRequest; id: string }[]): Promise<void> {
    if (moves.length === 0) {
      return;
    }
    await this.dbService.withWriteTx((tx) =>
      applyMoves(tx, topicTable, moves, {
        pkColumn: topicTable.id,
        scope: isNull(topicTable.deletedAt),
      }),
    );
  }

  private async deleteManyByIdsTx(
    tx: DbOrTx,
    ids: readonly string[],
    requireAll: boolean,
  ): Promise<string[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return [];
    }
    const rows = await tx
      .select({ id: topicTable.id })
      .from(topicTable)
      .where(and(inArray(topicTable.id, uniqueIds), isNull(topicTable.deletedAt)));
    const deletedIds = rows.map((row: { id: string }) => row.id);
    if (requireAll && deletedIds.length !== uniqueIds.length) {
      const foundIds = new Set(deletedIds);
      const missingId = uniqueIds.find((id) => !foundIds.has(id)) ?? uniqueIds[0];
      throw DataApiErrorFactory.notFound('Topic', missingId);
    }
    if (deletedIds.length === 0) {
      return [];
    }

    await tx.delete(messageTable).where(inArray(messageTable.topicId, deletedIds));
    await pinService.purgeForEntitiesTx(tx, 'topic', deletedIds);
    await tx.delete(topicTable).where(inArray(topicTable.id, deletedIds));
    return deletedIds;
  }
}

export const topicService = new TopicService();
registerDataService('TopicService', topicService);

export function rowToTopic(row: TopicRow): Topic {
  return {
    ...(row.activeNodeId ? { activeNodeId: row.activeNodeId } : {}),
    ...(row.assistantId ? { assistantId: row.assistantId } : {}),
    createdAt: timestampToISO(row.createdAt),
    id: row.id,
    isNameManuallyEdited: row.isNameManuallyEdited,
    name: row.name,
    orderKey: row.orderKey,
    ...(row.traceId ? { traceId: row.traceId } : {}),
    updatedAt: timestampToISO(row.updatedAt),
  };
}

function rowToTopicListItem(row: TopicRow, latestMessageText: string | null): TopicListItem {
  return {
    ...rowToTopic(row),
    latestMessageText: latestMessageText ?? '',
  };
}

async function assertActiveAssistantTx(tx: DbOrTx, assistantId: string): Promise<void> {
  const [assistant] = await tx
    .select({ id: assistantTable.id })
    .from(assistantTable)
    .where(and(eq(assistantTable.id, assistantId), isNull(assistantTable.deletedAt)))
    .limit(1);
  if (!assistant) {
    throw DataApiErrorFactory.notFound('Assistant', assistantId);
  }
}

async function getPathRowsToNodeTx(
  tx: DbOrTx,
  nodeId: string,
  topicId: string,
): Promise<MessageRow[]> {
  const idRows = (await tx.all(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id FROM message
      WHERE id = ${nodeId} AND topic_id = ${topicId} AND deleted_at IS NULL
      UNION ALL
      SELECT m.id, m.parent_id FROM message m
      INNER JOIN ancestors a ON m.id = a.parent_id
      WHERE m.topic_id = ${topicId} AND m.deleted_at IS NULL
    )
    SELECT id FROM ancestors
  `)) as { id: string }[];
  if (idRows.length === 0) {
    throw DataApiErrorFactory.notFound('Message', nodeId);
  }
  const ids = idRows.map((row) => row.id);
  const rows = (await tx
    .select()
    .from(messageTable)
    .where(and(inArray(messageTable.id, ids), eq(messageTable.topicId, topicId)))) as MessageRow[];
  const positions = new Map(ids.map((id, index) => [id, index]));
  const chain = rows
    .sort(
      (left, right) =>
        (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    )
    .reverse();
  const contentRows = chain.filter((row) => row.role !== 'root');
  if (contentRows.length === 0) {
    throw DataApiErrorFactory.invalidOperation('copy message path', 'Source path is empty');
  }
  return contentRows;
}

async function copyPathRowsTx(
  tx: DbOrTx,
  rows: MessageRow[],
  topicId: string,
  destinationRootId: string,
): Promise<{ activeNodeId: string; sourceIdMap: Map<string, string> }> {
  const sourceIdMap = new Map<string, string>();
  let activeNodeId = '';
  for (const source of rows) {
    const parentId =
      source.parentId && sourceIdMap.has(source.parentId)
        ? (sourceIdMap.get(source.parentId) as string)
        : destinationRootId;
    // react-doctor-disable-next-line async-await-in-loop -- each copied parent depends on the previous inserted id
    const [copy] = await tx
      .insert(messageTable)
      .values({
        data: source.data,
        messageSnapshot: source.messageSnapshot,
        modelId: source.modelId,
        parentId,
        role: source.role,
        siblingsGroupId: 0,
        stats: copyTimingStats(source.stats),
        status: source.status === 'pending' ? 'error' : source.status,
        topicId,
      })
      .returning({ id: messageTable.id });
    sourceIdMap.set(source.id, copy.id);
    activeNodeId = copy.id;
  }
  return { activeNodeId, sourceIdMap };
}

function copyTimingStats(stats: MessageStats | null): MessageStats | null {
  if (!stats) {
    return null;
  }
  const copy: MessageStats = {
    ...(stats.runtimeTiming ? { runtimeTiming: stats.runtimeTiming } : {}),
    ...(stats.timeCompletionMs !== undefined ? { timeCompletionMs: stats.timeCompletionMs } : {}),
    ...(stats.timeFirstTokenMs !== undefined ? { timeFirstTokenMs: stats.timeFirstTokenMs } : {}),
    ...(stats.timeThinkingMs !== undefined ? { timeThinkingMs: stats.timeThinkingMs } : {}),
  };
  return Object.keys(copy).length > 0 ? copy : null;
}

async function copyChatMessageFileRefsTx(
  tx: DbOrTx,
  sourceIdMap: ReadonlyMap<string, string>,
): Promise<void> {
  const sourceIds = [...sourceIdMap.keys()];
  for (let index = 0; index < sourceIds.length; index += sqliteInArrayChunk) {
    // react-doctor-disable-next-line async-await-in-loop -- chunks avoid SQLite's variable limit
    const refs = await tx
      .select()
      .from(chatMessageFileRefTable)
      .where(
        inArray(
          chatMessageFileRefTable.sourceId,
          sourceIds.slice(index, index + sqliteInArrayChunk),
        ),
      );
    const values = refs.flatMap((ref: { fileEntryId: string; role: string; sourceId: string }) => {
      const sourceId = sourceIdMap.get(ref.sourceId);
      return sourceId ? [{ fileEntryId: ref.fileEntryId, role: ref.role, sourceId }] : [];
    });
    for (let offset = 0; offset < values.length; offset += sqliteInsertChunk) {
      // react-doctor-disable-next-line async-await-in-loop -- chunks avoid SQLite's variable limit
      await tx
        .insert(chatMessageFileRefTable)
        .values(values.slice(offset, offset + sqliteInsertChunk));
    }
  }
}

function buildSearchPredicate(query: string | undefined): SQL | undefined {
  const trimmed = query?.trim();
  if (!trimmed) {
    return undefined;
  }
  return sql`${topicTable.name} LIKE ${`%${trimmed.replace(/[\\%_]/g, '\\$&')}%`} ESCAPE '\\'`;
}

function decodeTopicCursor(raw: string | undefined): TopicCursor {
  if (!raw) {
    return firstPageCursor;
  }
  const separator = raw.indexOf(':');
  if (separator < 0) {
    return firstPageCursor;
  }
  const section = raw.slice(0, separator);
  const rest = raw.slice(separator + 1);
  if (section === 'entity' && rest === '') {
    return { id: null, orderKey: null, section: 'entity' };
  }
  const idSeparator = rest.indexOf(':');
  if (idSeparator < 0) {
    return firstPageCursor;
  }
  const orderKey = rest.slice(0, idSeparator);
  const id = rest.slice(idSeparator + 1);
  if (!orderKey || !id) {
    return firstPageCursor;
  }
  if (section === 'pin' || section === 'entity') {
    return { id, orderKey, section };
  }
  return firstPageCursor;
}

function encodePinCursor(orderKey: string, id: string): string {
  return `pin:${orderKey}:${id}`;
}

function encodeEntityCursor(orderKey: string, id: string): string {
  return `entity:${orderKey}:${id}`;
}

function encodeEntitySectionStart(): string {
  return 'entity:';
}
