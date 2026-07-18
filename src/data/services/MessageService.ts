import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import type {
  ActiveNodeStrategy,
  CreateMessageDto,
  DeleteMessageResponse,
  UpdateMessageDto,
} from '@/data/api/schemas/messages';
import { DataApiErrorFactory } from '@/data/types/apiTypes';
import type {
  BranchMessage,
  BranchMessagesResponse,
  Message,
  MessageData,
  SiblingsGroup,
  TreeNode,
  TreeResponse,
} from '@/data/types/message';
import type { UniqueModelId } from '@/data/types/model';

import type { DbService } from '../db/DbService';
import { type MessageRow, messageTable, topicTable } from '../db/schemas';
import type { TopicService } from './TopicService';
import { timestampToISO } from './utils/rowMappers';

const previewLength = 50;
const defaultLimit = 20;

export type BranchMessagesParams = {
  cursor?: string;
  includeSiblings?: boolean;
  limit?: number;
  nodeId?: string;
};

export interface AssistantPlaceholder
  extends Omit<CreateMessageDto, 'parentId' | 'setAsActive' | 'siblingsGroupId'> {
  id?: string;
}

export interface CreateUserMessageWithPlaceholdersInput {
  placeholders: AssistantPlaceholder[];
  siblingsGroupId?: number;
  topicId: string;
  userMessage: { dto: CreateMessageDto; mode: 'create' } | { id: string; mode: 'existing' };
}

export interface CreateUserMessageWithPlaceholdersResult {
  placeholders: Message[];
  userMessage: Message;
}

export type ReserveAssistantTurnPlaceholder = AssistantPlaceholder;
export type ReserveAssistantTurnInput = CreateUserMessageWithPlaceholdersInput;
export type ReserveAssistantTurnResult = CreateUserMessageWithPlaceholdersResult;

export class MessageService {
  constructor(
    private readonly dbService: DbService,
    private readonly topicService: TopicService,
  ) {}

  private get db() {
    return this.dbService.getDb();
  }

  async getTree(
    topicId: string,
    options: { depth?: number; nodeId?: string; rootId?: string } = {},
  ): Promise<TreeResponse> {
    const { depth = 1 } = options;
    const [topic] = await this.db
      .select()
      .from(topicTable)
      .where(and(eq(topicTable.id, topicId), isNull(topicTable.deletedAt)))
      .limit(1);

    if (!topic) {
      throw DataApiErrorFactory.notFound('Topic', topicId);
    }

    const activeNodeId = options.nodeId ?? topic.activeNodeId;
    let rootId = options.rootId;

    if (!rootId) {
      const [root] = await this.db
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
      rootId = root?.id;
    }

    if (!rootId) {
      return { activeNodeId: null, nodes: [], rootId: null, siblingsGroups: [] };
    }

    // Ancestor walk naturally includes the virtual root itself (its null parentId ends the
    // recursion); the root is never a user-visible node, so it's excluded here.
    const activePath = new Set<string>();
    if (activeNodeId) {
      const pathRows = await this.db.all<{ id: string }>(sql`
        WITH RECURSIVE path AS (
          SELECT id, parent_id FROM message WHERE id = ${activeNodeId} AND deleted_at IS NULL
          UNION ALL
          SELECT m.id, m.parent_id FROM message m
          INNER JOIN path p ON m.id = p.parent_id
          WHERE m.deleted_at IS NULL
        )
        SELECT id FROM path
      `);
      for (const row of pathRows) {
        activePath.add(row.id);
      }
      activePath.delete(rootId);
    }

    // Starts at the root's children (depth 0), not the root itself, so the content-less
    // virtual root is never part of the returned tree.
    const maxDepth = depth === -1 ? 999 : depth;
    const treeDepthRows = await this.db.all<{ id: string; tree_depth: number }>(sql`
      WITH RECURSIVE tree AS (
        SELECT id, 0 as tree_depth FROM message WHERE parent_id = ${rootId} AND deleted_at IS NULL
        UNION ALL
        SELECT m.id, t.tree_depth + 1 FROM message m
        INNER JOIN tree t ON m.parent_id = t.id
        WHERE t.tree_depth < ${maxDepth} AND m.deleted_at IS NULL
      )
      SELECT id, tree_depth FROM tree
    `);

    const depthById = new Map(treeDepthRows.map((row) => [row.id, row.tree_depth]));
    const baseRows =
      treeDepthRows.length === 0
        ? []
        : await this.db
            .select()
            .from(messageTable)
            .where(
              inArray(
                messageTable.id,
                treeDepthRows.map((row) => row.id),
              ),
            );

    const treeRows: (MessageRow & { treeDepth: number })[] = baseRows.map((row) => ({
      ...row,
      treeDepth: depthById.get(row.id) ?? 0,
    }));
    const loadedIds = new Set(treeRows.map((row) => row.id));
    const missingActivePathIds = [...activePath].filter((id) => !loadedIds.has(id));

    if (missingActivePathIds.length > 0) {
      const additionalRows = await this.db
        .select()
        .from(messageTable)
        .where(and(inArray(messageTable.id, missingActivePathIds), isNull(messageTable.deletedAt)));
      for (const row of additionalRows) {
        treeRows.push({ ...row, treeDepth: maxDepth + 1 });
        loadedIds.add(row.id);
      }
    }

    const activePathArray = [...activePath];
    if (activePathArray.length > 0) {
      const childrenRows = await this.db
        .select()
        .from(messageTable)
        .where(
          and(inArray(messageTable.parentId, activePathArray), isNull(messageTable.deletedAt)),
        );

      for (const row of childrenRows) {
        if (!loadedIds.has(row.id)) {
          treeRows.push({ ...row, treeDepth: maxDepth + 1 });
          loadedIds.add(row.id);
        }
      }
    }

    if (treeRows.length === 0) {
      return { activeNodeId: null, nodes: [], rootId, siblingsGroups: [] };
    }

    const messagesById = new Map<string, Message>();
    const childrenMap = new Map<string, string[]>();
    const depthMap = new Map<string, number>();

    for (const row of treeRows) {
      const message = rowToMessage(row);
      messagesById.set(message.id, message);
      depthMap.set(message.id, row.treeDepth);

      const parentId = message.parentId ?? 'root';
      const children = childrenMap.get(parentId) ?? [];
      children.push(message.id);
      childrenMap.set(parentId, children);
    }

    const resultNodes: TreeNode[] = [];
    const siblingsGroups: SiblingsGroup[] = [];
    const visitedGroups = new Set<string>();

    for (const message of messagesById.values()) {
      const currentDepth = depthMap.get(message.id) ?? 0;
      const shouldInclude =
        depth === -1 ||
        currentDepth <= depth ||
        activePath.has(message.id) ||
        message.id === activeNodeId;

      if (!shouldInclude) {
        continue;
      }

      resultNodes.push(messageToTreeNode(message, (childrenMap.get(message.id) ?? []).length > 0));

      if (message.siblingsGroupId !== 0) {
        const groupKey = groupKeyFor(message.parentId, message.siblingsGroupId);
        if (!visitedGroups.has(groupKey)) {
          visitedGroups.add(groupKey);
          const groupMessages = [...messagesById.values()].filter(
            (candidate) =>
              candidate.parentId === message.parentId &&
              candidate.siblingsGroupId === message.siblingsGroupId,
          );

          if (groupMessages.length > 1) {
            siblingsGroups.push({
              nodes: groupMessages.map((candidate) => {
                const node = messageToTreeNode(
                  candidate,
                  (childrenMap.get(candidate.id) ?? []).length > 0,
                );
                const { parentId: _parentId, ...nodeWithoutParent } = node;
                return nodeWithoutParent;
              }),
              parentId: message.parentId ?? 'root',
              siblingsGroupId: message.siblingsGroupId,
            });
          }
        }
      }
    }

    return {
      activeNodeId: topic.activeNodeId,
      nodes: resultNodes,
      rootId,
      siblingsGroups,
    };
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

  async getChildrenByParentId(parentId: string): Promise<Message[]> {
    const rows = await this.db
      .select()
      .from(messageTable)
      .where(and(eq(messageTable.parentId, parentId), isNull(messageTable.deletedAt)));
    return rows.map(rowToMessage);
  }

  async updateSiblingsGroupId(id: string, siblingsGroupId: number): Promise<void> {
    await this.dbService.withWriteTx((tx) =>
      tx.update(messageTable).set({ siblingsGroupId }).where(eq(messageTable.id, id)),
    );
  }

  async createSibling(sourceId: string, data: MessageData): Promise<Message> {
    return await this.dbService.withWriteTx(async (tx) => {
      const [source] = await tx
        .select()
        .from(messageTable)
        .where(eq(messageTable.id, sourceId))
        .limit(1);
      if (!source) {
        throw DataApiErrorFactory.notFound('Message', sourceId);
      }

      if (source.role === 'root') {
        throw DataApiErrorFactory.invalidOperation(
          'create sibling',
          'cannot create a sibling of the virtual root',
        );
      }

      let siblingsGroupId = source.siblingsGroupId;
      if (siblingsGroupId === 0) {
        siblingsGroupId = Date.now();
        await tx.update(messageTable).set({ siblingsGroupId }).where(eq(messageTable.id, sourceId));
      }

      const [row] = await tx
        .insert(messageTable)
        .values({
          data,
          parentId: source.parentId,
          role: source.role,
          siblingsGroupId,
          // A user sibling (edit-and-resend) already carries its final content; only
          // assistant turns stream. Boot reconcile repairs assistant `pending` rows only,
          // so a user row left `pending` would never be repaired.
          status: source.role === 'user' ? 'success' : 'pending',
          topicId: source.topicId,
        })
        .returning();

      await this.topicService.setActiveNodeTx(tx, source.topicId, row.id, { assumeValid: true });
      return rowToMessage(row);
    });
  }

  async create(topicId: string, dto: CreateMessageDto): Promise<Message> {
    if (dto.role === 'root') {
      throw DataApiErrorFactory.invalidOperation(
        'create message',
        'the virtual root is created automatically and cannot be created via this endpoint',
      );
    }

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
          modelSnapshot: dto.modelSnapshot ?? null,
          parentId: resolvedParentId,
          role: dto.role,
          siblingsGroupId: dto.siblingsGroupId ?? 0,
          stats: dto.stats ?? null,
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
        const dto = input.userMessage.dto;
        const resolvedParentId =
          dto.parentId === undefined || dto.parentId === null
            ? await getRootMessageIdTx(tx, input.topicId)
            : await validateParent(tx, input.topicId, dto.parentId);
        const [row] = await tx
          .insert(messageTable)
          .values({
            data: dto.data,
            modelId: dto.modelId ?? null,
            modelSnapshot: dto.modelSnapshot ?? null,
            parentId: resolvedParentId,
            role: dto.role,
            siblingsGroupId: dto.siblingsGroupId ?? 0,
            stats: dto.stats ?? null,
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
            modelSnapshot: placeholder.modelSnapshot ?? null,
            parentId: userMessage.id,
            role: placeholder.role,
            siblingsGroupId: input.siblingsGroupId ?? 0,
            stats: placeholder.stats ?? null,
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
      if (dto.stats !== undefined) {
        updates.stats = dto.stats;
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

  async getPathThrough(topicId: string, nodeId: string): Promise<Message[]> {
    const [node] = await this.db
      .select({ id: messageTable.id })
      .from(messageTable)
      .where(
        and(
          eq(messageTable.id, nodeId),
          eq(messageTable.topicId, topicId),
          isNull(messageTable.deletedAt),
        ),
      )
      .limit(1);

    if (!node) {
      throw DataApiErrorFactory.notFound('Message', nodeId);
    }

    const [leaf] = await this.db.all<{ id: string }>(sql`
      WITH RECURSIVE subtree AS (
        SELECT id, created_at FROM message
          WHERE id = ${nodeId} AND topic_id = ${topicId} AND deleted_at IS NULL
        UNION ALL
        SELECT m.id, m.created_at FROM message m
          INNER JOIN subtree s ON m.parent_id = s.id
          WHERE m.deleted_at IS NULL
      )
      SELECT s.id FROM subtree s
      WHERE NOT EXISTS (
        SELECT 1 FROM message c
        WHERE c.parent_id = s.id AND c.deleted_at IS NULL
      )
      ORDER BY s.created_at DESC
      LIMIT 1
    `);

    return await this.getPathToNode(leaf?.id ?? nodeId);
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

  /** Assistant messages still `pending` with no in-memory writer — only true
   * right after a cold start, when a crash left them without a terminal status. */
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

  async markMessagesError(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.dbService.withWriteTx((tx) =>
      tx.update(messageTable).set({ status: 'error' }).where(inArray(messageTable.id, ids)),
    );
  }
}

export function rowToMessage(row: MessageRow): Message {
  return {
    createdAt: timestampToISO(row.createdAt),
    data: row.data,
    id: row.id,
    modelId: (row.modelId ?? null) as UniqueModelId | null,
    modelSnapshot: row.modelSnapshot ?? null,
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

function messageToTreeNode(message: Message, hasChildren: boolean): TreeNode {
  return {
    createdAt: message.createdAt,
    hasChildren,
    id: message.id,
    modelId: message.modelId,
    parentId: message.parentId,
    preview: extractPreview(message),
    role: message.role === 'system' ? 'assistant' : message.role,
    status: message.status,
  };
}

function extractPreview(message: Message): string {
  const parts = message.data.parts ?? [];
  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string') {
      const text = part.text.trim();
      if (text.length > 0) {
        return text.length > previewLength ? `${text.slice(0, previewLength)}...` : text;
      }
    }
  }

  return '';
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
