import {
  type ApprovalDecision,
  applyToolApprovalDecisionsToParts,
  countPendingToolApprovals,
  finalizeDanglingToolApprovals,
} from '@cherrystudio/universal/ai/transport/toolApprovals';
import { isToolUIPart } from 'ai';
import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import type {
  ActiveNodeStrategy,
  ClearTopicMessagesResponse,
  BranchMessage,
  BranchMessagesResponse,
  CreateMessageDto,
  DeleteMessageResponse,
  UpdateMessageDto,
} from '@/shared/data/api/schemas/messages';
import type {
  CherryMessagePart,
  Message,
  MessageData,
  MessageRuntimeStatsInput,
  MessageStats,
} from '@/shared/data/types/message';
import type { UniqueModelId } from '@/shared/data/types/model';

import { type MessageRow, messageTable, topicTable } from '../db/schemas';
import { createOrderedUuid } from '../db/schemas/_columnHelpers';
import { getDataService } from './dataServiceRegistry';
import { mergeMessageRuntimeStats } from './utils/messageStats';
import { timestampToISO } from './utils/rowMappers';

const defaultLimit = 20;
const logger = loggerService.withContext('MessageService');

export type BranchMessagesParams = {
  cursor?: string;
  includeSiblings?: boolean;
  limit?: number;
  nodeId?: string;
};

export interface AssistantPlaceholder extends Omit<
  CreateMessageDto,
  'parentId' | 'setAsActive' | 'siblingsGroupId'
> {
  id?: string;
}

export interface CreateUserMessageWithPlaceholdersInput {
  placeholders: AssistantPlaceholder[];
  siblingsGroupId?: number;
  topicId: string;
  /**
   * `id` sits beside `dto`, not inside it: `CreateMessageDto` is the HTTP
   * boundary's strict object, and an id is not something a remote caller gets
   * to choose. In-process callers do — see `newMessageId`.
   */
  userMessage:
    | { dto: CreateMessageDto; id?: string; mode: 'create' }
    | { id: string; mode: 'existing' };
}

export interface CreateUserMessageWithPlaceholdersResult {
  placeholders: Message[];
  userMessage: Message;
}

export type ReserveAssistantTurnPlaceholder = AssistantPlaceholder;
export type ReserveAssistantTurnInput = CreateUserMessageWithPlaceholdersInput;
export type ReserveAssistantTurnResult = CreateUserMessageWithPlaceholdersResult;

export class MessageService {
  /**
   * Resolved per call rather than injected once, so the instance holds no
   * reference to a particular host generation and a replaced host cannot leave
   * this singleton writing to a closed connection.
   */
  private get dbService() {
    return application.get('DbService');
  }

  /**
   * Lazily located: `TopicService` imports `createRootMessageTx` from this
   * module, so a direct import of its singleton here would close a value-level
   * cycle the bundler cannot order.
   */
  private get topicService() {
    return getDataService('TopicService');
  }

  private get db() {
    return this.dbService.getDb();
  }

  async getBranchMessages(
    topicId: string,
    params: BranchMessagesParams = {},
  ): Promise<BranchMessagesResponse> {
    const { cursor, includeSiblings = true, limit = defaultLimit } = params;
    const [topic] = await this.db
      .select()
      .from(topicTable)
      .where(and(eq(topicTable.id, topicId), isNull(topicTable.deletedAt)))
      .limit(1);

    if (!topic) {
      throw DataApiErrorFactory.notFound('Topic', topicId);
    }

    const nodeId = params.nodeId ?? topic.activeNodeId;
    if (!nodeId) {
      return {
        activeNodeId: null,
        assistantId: topic.assistantId,
        items: [],
        nextCursor: undefined,
      };
    }

    const pathIdRows = await this.db.all<{ id: string }>(sql`
      WITH RECURSIVE path AS (
        SELECT id, parent_id FROM message WHERE id = ${nodeId} AND deleted_at IS NULL
        UNION ALL
        SELECT m.id, m.parent_id FROM message m
        INNER JOIN path p ON m.id = p.parent_id
        WHERE m.deleted_at IS NULL
      )
      SELECT path.id FROM path
      JOIN message m ON m.id = path.id
      WHERE m.role != 'root'
    `);

    if (pathIdRows.length === 0) {
      throw DataApiErrorFactory.notFound('Message', nodeId);
    }

    const pathIds = pathIdRows.map((row) => row.id);
    const pathRows = await this.db
      .select()
      .from(messageTable)
      .where(inArray(messageTable.id, pathIds));
    const pathOrder = new Map(pathIds.map((id, index) => [id, index]));
    const fullPath = pathRows
      .sort(
        (a, b) =>
          (pathOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (pathOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      )
      .reverse();

    let startIndex = 0;
    let endIndex = fullPath.length;

    if (cursor) {
      const cursorIndex = fullPath.findIndex((message) => message.id === cursor);
      if (cursorIndex === -1) {
        throw DataApiErrorFactory.notFound('Message (cursor)', cursor);
      }
      startIndex = Math.max(0, cursorIndex - limit);
      endIndex = cursorIndex;
    } else {
      startIndex = Math.max(0, fullPath.length - limit);
    }

    const paginatedPath = fullPath.slice(startIndex, endIndex);
    const nextCursor = startIndex > 0 ? fullPath[startIndex].id : undefined;
    const items = includeSiblings
      ? await this.buildBranchMessagesWithSiblings(paginatedPath)
      : paginatedPath.map((row) => ({ message: rowToMessage(row) }));

    return {
      activeNodeId: topic.activeNodeId,
      assistantId: topic.assistantId,
      items,
      nextCursor,
    };
  }

  async getById(id: string): Promise<Message> {
    const [row] = await this.db
      .select()
      .from(messageTable)
      .where(and(eq(messageTable.id, id), isNull(messageTable.deletedAt)))
      .limit(1);

    if (!row) {
      throw DataApiErrorFactory.notFound('Message', id);
    }

    return rowToMessage(row);
  }

  async create(topicId: string, dto: CreateMessageDto): Promise<Message> {
    return await this.dbService.withWriteTx(async (tx) => {
      const [topic] = await tx
        .select()
        .from(topicTable)
        .where(and(eq(topicTable.id, topicId), isNull(topicTable.deletedAt)))
        .limit(1);

      if (!topic) {
        throw DataApiErrorFactory.notFound('Topic', topicId);
      }

      const resolvedParentId = await resolveParentId(tx, topicId, topic.activeNodeId, dto.parentId);
      const [row] = await tx
        .insert(messageTable)
        .values({
          data: dto.data,
          modelId: dto.modelId ?? null,
          messageSnapshot: dto.messageSnapshot ?? null,
          parentId: resolvedParentId,
          role: dto.role,
          siblingsGroupId: dto.siblingsGroupId ?? 0,
          status: dto.status ?? 'pending',
          topicId,
        })
        .returning();

      if (dto.setAsActive !== false) {
        await this.topicService.setActiveNodeTx(tx, topicId, row.id, { assumeValid: true });
      }

      return rowToMessage(row);
    });
  }

  /**
   * Allocate a message id before the row exists, so a caller can show the
   * message it is about to write and have the persisted row arrive under the
   * same identity. Same generator as the column default, so the ids stay
   * time-ordered.
   */
  newMessageId(): string {
    return createOrderedUuid();
  }

  async createUserMessageWithPlaceholders(
    input: CreateUserMessageWithPlaceholdersInput,
  ): Promise<CreateUserMessageWithPlaceholdersResult> {
    return await this.dbService.withWriteTx(async (tx) => {
      const [topic] = await tx
        .select({ id: topicTable.id })
        .from(topicTable)
        .where(and(eq(topicTable.id, input.topicId), isNull(topicTable.deletedAt)))
        .limit(1);

      if (!topic) {
        throw DataApiErrorFactory.notFound('Topic', input.topicId);
      }

      let userMessage: Message;
      if (input.userMessage.mode === 'create') {
        const { dto, id } = input.userMessage;
        const resolvedParentId =
          dto.parentId === undefined || dto.parentId === null
            ? await getRootMessageIdTx(tx, input.topicId)
            : await validateParent(tx, input.topicId, dto.parentId);
        const [row] = await tx
          .insert(messageTable)
          .values({
            ...(id ? { id } : {}),
            data: dto.data,
            modelId: dto.modelId ?? null,
            messageSnapshot: dto.messageSnapshot ?? null,
            parentId: resolvedParentId,
            role: dto.role,
            siblingsGroupId: dto.siblingsGroupId ?? 0,
            status: dto.status ?? 'pending',
            topicId: input.topicId,
          })
          .returning();
        userMessage = rowToMessage(row);
      } else {
        const [row] = await tx
          .select()
          .from(messageTable)
          .where(and(eq(messageTable.id, input.userMessage.id), isNull(messageTable.deletedAt)))
          .limit(1);
        if (!row) {
          throw DataApiErrorFactory.notFound('Message', input.userMessage.id);
        }
        if (row.topicId !== input.topicId) {
          throw DataApiErrorFactory.invalidOperation(
            'reserve assistant turn',
            'User message does not belong to this topic',
          );
        }
        userMessage = rowToMessage(row);
      }

      if (input.siblingsGroupId !== undefined) {
        await tx
          .update(messageTable)
          .set({ siblingsGroupId: input.siblingsGroupId })
          .where(
            and(eq(messageTable.parentId, userMessage.id), eq(messageTable.siblingsGroupId, 0)),
          );
      }

      const placeholders: Message[] = [];
      for (const placeholder of input.placeholders) {
        // react-doctor-disable-next-line async-await-in-loop -- 同一写事务内按输入顺序插入占位消息，结果数组与 activeNode 取值依赖保序
        const [row] = await tx
          .insert(messageTable)
          .values({
            ...(placeholder.id ? { id: placeholder.id } : {}),
            data: placeholder.data,
            modelId: placeholder.modelId ?? null,
            messageSnapshot: placeholder.messageSnapshot ?? null,
            parentId: userMessage.id,
            role: placeholder.role,
            siblingsGroupId: input.siblingsGroupId ?? 0,
            status: placeholder.status ?? 'pending',
            topicId: input.topicId,
          })
          .returning();
        placeholders.push(rowToMessage(row));
      }

      const newActiveNodeId = placeholders.at(-1)?.id ?? userMessage.id;
      await this.topicService.setActiveNodeTx(tx, input.topicId, newActiveNodeId, {
        assumeValid: true,
      });

      return { placeholders, userMessage };
    });
  }

  async reserveAssistantTurn(
    input: ReserveAssistantTurnInput,
  ): Promise<ReserveAssistantTurnResult> {
    return this.createUserMessageWithPlaceholders(input);
  }

  async update(id: string, dto: UpdateMessageDto): Promise<Message> {
    if (dto.parentId !== undefined && dto.parentId !== null) {
      const descendants = await this.getDescendantIds(id);
      if (descendants.includes(dto.parentId)) {
        throw DataApiErrorFactory.invalidOperation('move message', 'would create cycle');
      }
    }

    return await this.dbService.withWriteTx(async (tx) => {
      const [existing] = await tx
        .select()
        .from(messageTable)
        .where(and(eq(messageTable.id, id), isNull(messageTable.deletedAt)))
        .limit(1);

      if (!existing) {
        throw DataApiErrorFactory.notFound('Message', id);
      }

      if (
        dto.parentId !== undefined &&
        dto.parentId !== existing.parentId &&
        dto.parentId !== null
      ) {
        await validateParent(tx, existing.topicId, dto.parentId);
      }

      const updates: Partial<typeof messageTable.$inferInsert> = {};
      if (dto.data !== undefined) {
        updates.data = dto.data;
      }
      if (dto.parentId !== undefined) {
        updates.parentId = dto.parentId;
      }
      if (dto.siblingsGroupId !== undefined) {
        updates.siblingsGroupId = dto.siblingsGroupId;
      }
      if (dto.status !== undefined) {
        updates.status = dto.status;
      }
      const [row] = await tx
        .update(messageTable)
        .set(updates)
        .where(eq(messageTable.id, id))
        .returning();
      if (!row) {
        throw DataApiErrorFactory.notFound('Message', id);
      }

      if (dto.data !== undefined) {
      }

      return rowToMessage(row);
    });
  }

  /**
   * Internal AI-runtime finalizer. Content/status and runtime timing are
   * message-owned; the merge preserves the existing record-owned usage
   * projection and never accepts usage or cost from this caller.
   */
  async finalizeAssistantMessage(
    id: string,
    input: {
      data: MessageData;
      status: Extract<Message['status'], 'success' | 'paused' | 'error'>;
      runtimeStats?: MessageRuntimeStatsInput;
    },
  ): Promise<Message> {
    return await this.dbService.withWriteTx(async (tx) => {
      const [existing] = await tx
        .select()
        .from(messageTable)
        .where(and(eq(messageTable.id, id), isNull(messageTable.deletedAt)))
        .limit(1);

      if (!existing) {
        throw DataApiErrorFactory.notFound('Message', id);
      }
      if (existing.role !== 'assistant') {
        throw DataApiErrorFactory.invalidOperation(
          'finalize message',
          'only assistant messages can be finalized',
        );
      }

      const stats = mergeMessageRuntimeStats(existing.stats, input.runtimeStats);
      const [row] = await tx
        .update(messageTable)
        .set({
          data: input.data,
          status: input.status,
          stats: stats ?? null,
        })
        .where(eq(messageTable.id, id))
        .returning();
      if (!row) {
        throw DataApiErrorFactory.notFound('Message', id);
      }

      return rowToMessage(row);
    });
  }

  async delete(
    id: string,
    cascade = false,
    activeNodeStrategy: ActiveNodeStrategy = 'parent',
  ): Promise<DeleteMessageResponse> {
    const message = await this.getById(id);
    const [topic] = await this.db
      .select()
      .from(topicTable)
      .where(and(eq(topicTable.id, message.topicId), isNull(topicTable.deletedAt)))
      .limit(1);

    if (!topic) {
      throw DataApiErrorFactory.notFound('Topic', message.topicId);
    }

    if (message.role === 'root') {
      throw DataApiErrorFactory.invalidOperation(
        'delete root message',
        'the virtual root cannot be deleted directly; delete the topic instead',
      );
    }

    const descendantIds = cascade ? await this.getDescendantIds(id) : [];

    return await this.dbService.withWriteTx(async (tx) => {
      let deletedIds: string[];
      let newActiveNodeId: null | string | undefined;
      let reparentedIds: string[] | undefined;

      if (cascade) {
        deletedIds = [id, ...descendantIds];
        if (topic.activeNodeId && deletedIds.includes(topic.activeNodeId)) {
          newActiveNodeId = activeNodeStrategy === 'clear' ? null : message.parentId;
        }

        await tx.delete(messageTable).where(inArray(messageTable.id, deletedIds));
      } else {
        // Splice this node out: reparent its children onto their grandparent.
        // siblingsGroupId is scoped to the parent, so a moved group's id could collide
        // with an unrelated group already under the destination parent and be
        // mis-rendered as one multi-response set. Rebase each distinct non-zero moved
        // group to a fresh id above both sides; group 0 (no group) carries unchanged.
        const children = await tx
          .select({ id: messageTable.id, siblingsGroupId: messageTable.siblingsGroupId })
          .from(messageTable)
          .where(and(eq(messageTable.parentId, id), isNull(messageTable.deletedAt)));
        reparentedIds = children.map((child) => child.id);

        if (children.length > 0) {
          const newParentId = message.parentId;
          const destinationGroups = newParentId
            ? await tx
                .select({ siblingsGroupId: messageTable.siblingsGroupId })
                .from(messageTable)
                .where(and(eq(messageTable.parentId, newParentId), isNull(messageTable.deletedAt)))
            : [];
          let nextGroupId =
            Math.max(
              0,
              ...destinationGroups.map((row) => row.siblingsGroupId),
              ...children.map((child) => child.siblingsGroupId),
            ) + 1;

          const childIdsByGroup = new Map<number, string[]>();
          for (const child of children) {
            const ids = childIdsByGroup.get(child.siblingsGroupId) ?? [];
            ids.push(child.id);
            childIdsByGroup.set(child.siblingsGroupId, ids);
          }

          for (const [groupId, ids] of childIdsByGroup) {
            // react-doctor-disable-next-line async-await-in-loop -- 同一写事务内本质串行，且 nextGroupId 递增分配需确定性顺序
            await tx
              .update(messageTable)
              .set({
                parentId: newParentId,
                siblingsGroupId: groupId === 0 ? 0 : nextGroupId++,
              })
              .where(inArray(messageTable.id, ids));
          }
        }

        deletedIds = [id];
        if (topic.activeNodeId === id) {
          newActiveNodeId = activeNodeStrategy === 'clear' ? null : message.parentId;
        }

        await tx.delete(messageTable).where(eq(messageTable.id, id));
      }

      if (newActiveNodeId !== undefined) {
        if (
          newActiveNodeId !== null &&
          newActiveNodeId === (await getRootMessageIdTx(tx, message.topicId))
        ) {
          newActiveNodeId = null;
        }

        if (newActiveNodeId === null) {
          await tx
            .update(topicTable)
            .set({ activeNodeId: null })
            .where(eq(topicTable.id, message.topicId));
        } else {
          await this.topicService.setActiveNodeTx(tx, message.topicId, newActiveNodeId, {
            assumeValid: true,
          });
        }
      }

      return {
        deletedIds,
        ...(newActiveNodeId !== undefined ? { newActiveNodeId } : {}),
        ...(reparentedIds?.length ? { reparentedIds } : {}),
      };
    });
  }

  async clearTopicMessages(topicId: string): Promise<ClearTopicMessagesResponse> {
    return await this.dbService.withWriteTx(async (tx) => {
      const rootId = await getRootMessageIdTx(tx, topicId);
      const rows = await tx
        .select({ id: messageTable.id })
        .from(messageTable)
        .where(
          and(
            eq(messageTable.topicId, topicId),
            ne(messageTable.id, rootId),
            isNull(messageTable.deletedAt),
          ),
        );
      const deletedIds = rows.map((row) => row.id);

      if (deletedIds.length === 0) {
        return { deletedIds };
      }

      await tx
        .delete(messageTable)
        .where(and(eq(messageTable.topicId, topicId), ne(messageTable.id, rootId)));
      await this.topicService.clearActiveNodeTx(tx, topicId);

      logger.info('Cleared topic messages', { count: deletedIds.length, topicId });
      return { deletedIds };
    });
  }

  async getPathToNode(nodeId: string): Promise<Message[]> {
    const ancestorIdRows = await this.db.all<{ id: string }>(sql`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id FROM message WHERE id = ${nodeId} AND deleted_at IS NULL
        UNION ALL
        SELECT m.id, m.parent_id FROM message m
        INNER JOIN ancestors a ON m.id = a.parent_id
        WHERE m.deleted_at IS NULL
      )
      SELECT ancestors.id FROM ancestors
      JOIN message m ON m.id = ancestors.id
      WHERE m.role != 'root'
    `);

    if (ancestorIdRows.length === 0) {
      throw DataApiErrorFactory.notFound('Message', nodeId);
    }

    const ancestorIds = ancestorIdRows.map((row) => row.id);
    const ancestorRows = await this.db
      .select()
      .from(messageTable)
      .where(inArray(messageTable.id, ancestorIds));
    const ancestorOrder = new Map(ancestorIds.map((id, index) => [id, index]));

    return ancestorRows
      .sort(
        (a, b) =>
          (ancestorOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (ancestorOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      )
      .reverse()
      .map(rowToMessage);
  }

  private async buildBranchMessagesWithSiblings(pathRows: MessageRow[]): Promise<BranchMessage[]> {
    const uniqueGroups = new Set<string>();
    const groupsToQuery: { parentId: null | string; siblingsGroupId: number }[] = [];

    for (const message of pathRows) {
      if (message.siblingsGroupId !== 0) {
        const key = groupKeyFor(message.parentId, message.siblingsGroupId);
        if (!uniqueGroups.has(key)) {
          uniqueGroups.add(key);
          groupsToQuery.push({
            parentId: message.parentId,
            siblingsGroupId: message.siblingsGroupId,
          });
        }
      }
    }

    const siblingsMap = new Map<string, Message[]>();
    if (groupsToQuery.length > 0) {
      const conditions = groupsToQuery.map((group) =>
        and(
          group.parentId === null
            ? isNull(messageTable.parentId)
            : eq(messageTable.parentId, group.parentId),
          eq(messageTable.siblingsGroupId, group.siblingsGroupId),
        ),
      );

      const siblingRows = await this.db
        .select()
        .from(messageTable)
        .where(and(isNull(messageTable.deletedAt), or(...conditions)));

      for (const row of siblingRows) {
        const key = groupKeyFor(row.parentId, row.siblingsGroupId);
        const group = siblingsMap.get(key) ?? [];
        group.push(rowToMessage(row));
        siblingsMap.set(key, group);
      }
    }

    return pathRows.map((row) => {
      const message = rowToMessage(row);
      const group =
        row.siblingsGroupId !== 0
          ? siblingsMap.get(groupKeyFor(row.parentId, row.siblingsGroupId))
          : undefined;
      const siblingsGroup =
        group && group.length > 1 ? group.filter((item) => item.id !== message.id) : undefined;

      return {
        message,
        ...(siblingsGroup ? { siblingsGroup } : {}),
      };
    });
  }

  private async getDescendantIds(id: string): Promise<string[]> {
    const result = await this.db.all<{ id: string }>(sql`
      WITH RECURSIVE descendants AS (
        SELECT id FROM message WHERE parent_id = ${id} AND deleted_at IS NULL
        UNION ALL
        SELECT m.id FROM message m
        INNER JOIN descendants d ON m.parent_id = d.id
        WHERE m.deleted_at IS NULL
      )
      SELECT id FROM descendants
    `);

    return result.map((row) => row.id);
  }

  /**
   * Apply tool approval decisions using the desktop contract. Mobile also
   * flips the final answered row to `pending` in this transaction so a process
   * kill cannot strand a fully answered turn outside cold-start recovery.
   */
  async applyToolApprovalDecisions(
    anchorId: string,
    decisions: ApprovalDecision[],
  ): Promise<{
    parts: CherryMessagePart[];
    appliedApprovalIds: string[];
    alreadySettledApprovalIds: string[];
  } | null> {
    const completedAt = Date.now();
    return await this.dbService.withWriteTx(async (tx) => {
      const [existing] = await tx
        .select()
        .from(messageTable)
        .where(and(eq(messageTable.id, anchorId), isNull(messageTable.deletedAt)))
        .limit(1);

      if (!existing) {
        return null;
      }

      const parts = existing.data.parts ?? [];
      const nextParts = applyToolApprovalDecisionsToParts(parts, decisions);
      const requestedIds = new Set(
        parts
          .filter((part) => isToolUIPart(part) && part.state === 'approval-requested')
          .map((part) => part.approval?.id)
          .filter((id): id is string => typeof id === 'string'),
      );
      const settledIds = new Set(
        parts
          .filter((part) => isToolUIPart(part) && part.state !== 'approval-requested')
          .map((part) => part.approval?.id)
          .filter((id): id is string => typeof id === 'string'),
      );
      const appliedApprovalIds = decisions
        .map((decision) => decision.approvalId)
        .filter((id) => requestedIds.has(id));
      const alreadySettledApprovalIds = decisions
        .map((decision) => decision.approvalId)
        .filter((id) => settledIds.has(id));

      if (appliedApprovalIds.length > 0) {
        const stats = appliedApprovalIds.reduce(
          (current, approvalId) => completeApprovalWait(current, approvalId, completedAt),
          existing.stats ?? undefined,
        );
        await tx
          .update(messageTable)
          .set({
            data: { ...existing.data, parts: nextParts },
            stats: stats ?? null,
            ...(countPendingToolApprovals(nextParts) === 0 ? { status: 'pending' as const } : {}),
          })
          .where(eq(messageTable.id, anchorId));
      }

      return {
        parts: nextParts,
        appliedApprovalIds,
        alreadySettledApprovalIds,
      };
    });
  }

  /**
   * Assistant messages still `pending` with no in-memory writer — only true
   * right after a cold start, when a crash left them without a terminal
   * status. `paused` rows are deliberately excluded because they represent a
   * user-stopped generation, matching desktop semantics.
   */
  async findPendingAssistantMessageIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: messageTable.id })
      .from(messageTable)
      .where(
        and(
          eq(messageTable.role, 'assistant'),
          eq(messageTable.status, 'pending'),
          isNull(messageTable.deletedAt),
        ),
      );

    return rows.map((row) => row.id);
  }

  /**
   * Settle crash-orphaned assistant rows: status to `error`, and any tool
   * approval still waiting or answered-but-unresumed to a terminal state.
   * The parts half is not cosmetic — an approval left unsettled means a tool
   * call with no result, which the provider rejects on every later request in
   * that branch.
   */
  async settleCrashedMessages(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.dbService.withWriteTx(async (tx) => {
      await tx.update(messageTable).set({ status: 'error' }).where(inArray(messageTable.id, ids));

      const rows = await tx.select().from(messageTable).where(inArray(messageTable.id, ids));
      for (const row of rows) {
        // Per row, because parts come back as JSON off disk: one shape the
        // types promise but an old row does not have would otherwise roll the
        // whole transaction back — including the status flip above, which
        // always applies. Every crashed row would stay `pending`, and the next
        // launch would fail the same way.
        try {
          const finalized = finalizeDanglingToolApprovals(
            row.data?.parts ?? [],
            crashedTurnApprovalReason,
          );
          if (finalized.matchedCount === 0) continue;

          await tx
            .update(messageTable)
            .set({ data: { ...row.data, parts: finalized.parts } })
            .where(eq(messageTable.id, row.id));
        } catch (error) {
          logger.error('Failed to settle the tool approvals of a crashed message', error as Error, {
            messageId: row.id,
          });
        }
      }
    });
  }
}

export const messageService = new MessageService();

/** Fed to the model as a tool result, so it stays untranslated. */
const crashedTurnApprovalReason = 'The app closed before this tool call completed.';

export function rowToMessage(row: MessageRow): Message {
  return {
    createdAt: timestampToISO(row.createdAt),
    data: row.data,
    id: row.id,
    modelId: (row.modelId ?? null) as UniqueModelId | null,
    messageSnapshot: row.messageSnapshot ?? null,
    parentId: row.parentId,
    role: row.role as Message['role'],
    searchableText: row.searchableText,
    siblingsGroupId: row.siblingsGroupId,
    stats: row.stats ?? null,
    status: row.status as Message['status'],
    topicId: row.topicId,
    updatedAt: timestampToISO(row.updatedAt),
  };
}

function completeApprovalWait(
  existing: MessageStats | null | undefined,
  approvalId: string,
  completedAt: number,
): MessageStats | undefined {
  const runtimeTiming = existing?.runtimeTiming;
  if (!runtimeTiming) return existing ?? undefined;

  const spans = runtimeTiming.spans.map((span) =>
    span.kind === 'approval-wait' &&
    span.approvalId === approvalId &&
    span.completedAt === undefined
      ? { ...span, completedAt: Math.max(span.startedAt, completedAt) }
      : span,
  );
  if (spans.every((span, index) => span === runtimeTiming.spans[index])) {
    return existing ?? undefined;
  }

  return mergeMessageRuntimeStats(existing, {
    runtimeTiming: {
      ...runtimeTiming,
      spans,
    },
  });
}

async function resolveParentId(
  tx: any,
  topicId: string,
  activeNodeId: null | string,
  inputParentId: null | string | undefined,
): Promise<string> {
  if (inputParentId === undefined) {
    return activeNodeId ?? (await getRootMessageIdTx(tx, topicId));
  }

  if (inputParentId === null) {
    return await getRootMessageIdTx(tx, topicId);
  }

  return await validateParent(tx, topicId, inputParentId);
}

/**
 * Inserts the topic's content-less virtual root message (role='root', parentId=null).
 * Must run inside the same write-tx as the topic insert — every topic has exactly one
 * root from creation, so no code path ever needs to lazily create one later.
 */
export async function createRootMessageTx(tx: any, topicId: string): Promise<string> {
  const [row] = await tx
    .insert(messageTable)
    .values({
      data: { parts: [] },
      parentId: null,
      role: 'root',
      status: 'success',
      topicId,
    })
    .returning({ id: messageTable.id });

  return row.id;
}

/** Looks up a topic's virtual root id. Throws if the topic has no root — this should never
 * happen since createRootMessageTx runs eagerly at topic creation. */
async function getRootMessageIdTx(tx: any, topicId: string): Promise<string> {
  const [root] = await tx
    .select({ id: messageTable.id })
    .from(messageTable)
    .where(
      and(
        eq(messageTable.topicId, topicId),
        eq(messageTable.role, 'root'),
        isNull(messageTable.deletedAt),
      ),
    )
    .limit(1);

  if (!root) {
    throw DataApiErrorFactory.invalidOperation(
      'resolve root message',
      `Topic ${topicId} has no virtual root message`,
    );
  }

  return root.id;
}

async function validateParent(tx: any, topicId: string, parentId: string): Promise<string> {
  const [parent] = await tx
    .select()
    .from(messageTable)
    .where(and(eq(messageTable.id, parentId), isNull(messageTable.deletedAt)))
    .limit(1);

  if (!parent) {
    throw DataApiErrorFactory.notFound('Message', parentId);
  }

  if (parent.topicId !== topicId) {
    throw DataApiErrorFactory.invalidOperation(
      'create message',
      'Parent message does not belong to this topic',
    );
  }

  return parentId;
}

function groupKeyFor(parentId: null | string, siblingsGroupId: number) {
  return `${parentId ?? '__root__'}-${siblingsGroupId}`;
}
