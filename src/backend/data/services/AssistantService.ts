import { and, asc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import {
  type AssistantRow,
  assistantKnowledgeBaseTable,
  assistantMcpServerTable,
  assistantTable,
  pinTable,
  userModelTable,
} from '@/backend/data/db/schemas';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { OrderRequest } from '@/shared/data/api/schemas/_endpointHelpers';
import {
  type CreateAssistantDto,
  type ListAssistantsQueryParams,
  ListAssistantsQuerySchema,
  type UpdateAssistantDto,
} from '@/shared/data/api/schemas/assistants';
import { DataApiErrorFactory, type OffsetPaginationResponse } from '@/shared/data/api/types';
import { type Assistant, DEFAULT_ASSISTANT_SETTINGS } from '@/shared/data/types/assistant';
import type { UniqueModelId } from '@/shared/data/types/model';
import type { Tag } from '@/shared/data/types/tag';

import type { ModelService } from './ModelService';
import type { PinService } from './PinService';
import type { TagService } from './TagService';
import { applyMoves, insertWithOrderKey } from './utils/orderKey';
import { timestampToISO } from './utils/rowMappers';

type AssistantRelationIds = Pick<Assistant, 'knowledgeBaseIds' | 'mcpServerIds'>;
type TxLike = any;

function createEmptyRelations(): AssistantRelationIds {
  return {
    knowledgeBaseIds: [],
    mcpServerIds: [],
  };
}

function rowToAssistant(
  row: AssistantRow,
  relations: AssistantRelationIds = createEmptyRelations(),
  tags: Tag[] = [],
  modelName: null | string = null,
): Assistant {
  return {
    createdAt: timestampToISO(row.createdAt),
    description: row.description,
    emoji: row.emoji,
    id: row.id,
    knowledgeBaseIds: relations.knowledgeBaseIds,
    mcpServerIds: relations.mcpServerIds,
    modelId: row.modelId as UniqueModelId | null,
    modelName,
    name: row.name,
    orderKey: row.orderKey,
    prompt: row.prompt,
    settings: row.settings,
    tags,
    updatedAt: timestampToISO(row.updatedAt),
  };
}

export class AssistantService {
  constructor(
    private readonly dbService: DbService,
    private readonly modelService: ModelService,
    private readonly preferenceService: PreferenceService,
    private readonly tagService: TagService,
    private readonly pinService: PinService,
  ) {}

  private get db() {
    return this.dbService.getDb();
  }

  async getById(id: string, options: { includeDeleted?: boolean } = {}): Promise<Assistant> {
    const conditions: SQL[] = [eq(assistantTable.id, id)];
    if (!options.includeDeleted) {
      conditions.push(isNull(assistantTable.deletedAt));
    }

    const [row] = await this.db
      .select({ assistant: assistantTable, modelName: userModelTable.name })
      .from(assistantTable)
      .leftJoin(userModelTable, eq(assistantTable.modelId, userModelTable.id))
      .where(and(...conditions))
      .limit(1);

    if (!row) {
      throw DataApiErrorFactory.notFound('Assistant', id);
    }

    const [relations, tags] = await Promise.all([
      this.getRelationIdsByAssistantIds(this.db, [id]),
      this.tagService.getTagsByEntitiesTx(this.db, 'assistant', [id]),
    ]);

    return rowToAssistant(row.assistant, relations.get(id), tags.get(id), row.modelName ?? null);
  }

  get(id: string): Promise<Assistant> {
    return this.getById(id);
  }

  async list(params: ListAssistantsQueryParams = {}): Promise<OffsetPaginationResponse<Assistant>> {
    const query = ListAssistantsQuerySchema.parse(params);
    const offset = (query.page - 1) * query.limit;
    const conditions: SQL[] = [isNull(assistantTable.deletedAt)];

    if (query.id !== undefined) {
      conditions.push(eq(assistantTable.id, query.id));
    }

    if (query.search) {
      const pattern = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      const searchClause = or(
        sql`${assistantTable.name} LIKE ${pattern} ESCAPE '\\'`,
        sql`${assistantTable.description} LIKE ${pattern} ESCAPE '\\'`,
      );
      if (searchClause) {
        conditions.push(searchClause);
      }
    }

    if (query.tagIds && query.tagIds.length > 0) {
      const assistantIds = await this.tagService.getEntityIdsByTagsTx(
        this.db,
        'assistant',
        query.tagIds,
      );
      conditions.push(
        assistantIds.length > 0 ? inArray(assistantTable.id, assistantIds) : sql`0 = 1`,
      );
    }

    const whereClause = and(...conditions);
    const [rows, countRows] = await Promise.all([
      this.db
        .select({ assistant: assistantTable, modelName: userModelTable.name })
        .from(assistantTable)
        .leftJoin(userModelTable, eq(assistantTable.modelId, userModelTable.id))
        .leftJoin(
          pinTable,
          and(eq(pinTable.entityType, 'assistant'), eq(pinTable.entityId, assistantTable.id)),
        )
        .where(whereClause)
        .orderBy(
          sql`CASE WHEN ${pinTable.orderKey} IS NULL THEN 1 ELSE 0 END`,
          asc(pinTable.orderKey),
          asc(assistantTable.orderKey),
          asc(assistantTable.createdAt),
        )
        .limit(query.limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(assistantTable)
        .where(whereClause),
    ]);

    const assistantIds = rows.map((row) => row.assistant.id);
    const [relations, tags] = await Promise.all([
      this.getRelationIdsByAssistantIds(this.db, assistantIds),
      this.tagService.getTagsByEntitiesTx(this.db, 'assistant', assistantIds),
    ]);

    return {
      items: rows.map((row) =>
        rowToAssistant(
          row.assistant,
          relations.get(row.assistant.id),
          tags.get(row.assistant.id),
          row.modelName ?? null,
        ),
      ),
      page: query.page,
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  async create(dto: CreateAssistantDto): Promise<Assistant> {
    this.validateName(dto.name);

    const { row, tags } = await this.dbService.withWriteTx(async (tx) => {
      const modelId = await this.resolveCreateModelId(tx, dto.modelId);
      const { mcpServerIds, tagIds, ...columnDto } = dto;
      const inserted = (await insertWithOrderKey(
        tx,
        assistantTable,
        {
          ...columnDto,
          emoji: dto.emoji ?? '🌟',
          modelId,
          settings: dto.settings ?? DEFAULT_ASSISTANT_SETTINGS,
        },
        { pkColumn: assistantTable.id, scope: isNull(assistantTable.deletedAt) },
      )) as AssistantRow;

      if (tagIds !== undefined) {
        await this.tagService.syncEntityTagsTx(tx, 'assistant', inserted.id, tagIds);
      }

      await this.syncRelationsTx(tx, inserted.id, { mcpServerIds });

      const tagMap = await this.tagService.getTagsByEntitiesTx(tx, 'assistant', [inserted.id]);
      return {
        row: inserted,
        tags: tagMap.get(inserted.id) ?? [],
      };
    });

    const modelName = await this.getModelName(row.modelId);

    return rowToAssistant(
      row,
      { knowledgeBaseIds: [], mcpServerIds: [...new Set(dto.mcpServerIds ?? [])] },
      tags,
      modelName,
    );
  }

  async update(id: string, dto: UpdateAssistantDto): Promise<Assistant> {
    const current = await this.getById(id);

    if (dto.name !== undefined) {
      this.validateName(dto.name);
    }

    const { mcpServerIds, settings: settingsPatch, tagIds, ...columnFields } = dto;
    const updates = Object.fromEntries(
      Object.entries(columnFields).filter(([, value]) => value !== undefined),
    ) as Partial<typeof assistantTable.$inferInsert>;

    if (settingsPatch !== undefined) {
      updates.settings = { ...current.settings, ...settingsPatch };
    }

    const hasColumnUpdates = Object.keys(updates).length > 0;
    const hasTagUpdates = tagIds !== undefined;
    const hasMcpUpdates = mcpServerIds !== undefined;

    if (!hasColumnUpdates && !hasTagUpdates && !hasMcpUpdates) {
      return current;
    }

    const aliveFilter = and(eq(assistantTable.id, id), isNull(assistantTable.deletedAt));

    const { modelName, row, tags } = await this.dbService.withWriteTx(async (tx) => {
      if (dto.modelId && !(await this.modelExistsTx(tx, dto.modelId))) {
        throw DataApiErrorFactory.validation(
          { modelId: [`Model '${dto.modelId}' is not registered in user_model`] },
          `Assistant modelId '${dto.modelId}' is not registered - add the model first or pass null`,
        );
      }

      let next: AssistantRow;
      if (hasColumnUpdates) {
        const [updated] = await tx
          .update(assistantTable)
          .set(updates)
          .where(aliveFilter)
          .returning();
        if (!updated) {
          throw DataApiErrorFactory.notFound('Assistant', id);
        }
        next = updated;
      } else {
        const [existing] = await tx.select().from(assistantTable).where(aliveFilter).limit(1);
        if (!existing) {
          throw DataApiErrorFactory.notFound('Assistant', id);
        }
        next = existing;
      }

      if (hasTagUpdates) {
        await this.tagService.syncEntityTagsTx(tx, 'assistant', id, tagIds);
      }

      await this.syncRelationsTx(tx, id, { mcpServerIds });

      const nextTags = hasTagUpdates
        ? ((await this.tagService.getTagsByEntitiesTx(tx, 'assistant', [id])).get(id) ?? [])
        : current.tags;
      const nextModelName =
        dto.modelId !== undefined && dto.modelId !== current.modelId
          ? await this.getModelName(dto.modelId)
          : current.modelName;

      return { modelName: nextModelName, row: next, tags: nextTags };
    });

    return rowToAssistant(
      row,
      {
        knowledgeBaseIds: current.knowledgeBaseIds,
        mcpServerIds: hasMcpUpdates ? [...new Set(mcpServerIds)] : current.mcpServerIds,
      },
      tags,
      modelName,
    );
  }

  async delete(id: string): Promise<void> {
    await this.getActiveRowById(id);

    await this.dbService.withWriteTx(async (tx) => {
      await tx
        .update(assistantTable)
        .set({ deletedAt: Date.now() })
        .where(and(eq(assistantTable.id, id), isNull(assistantTable.deletedAt)));
      await this.tagService.purgeForEntityTx(tx, 'assistant', id);
      await this.pinService.purgeForEntityTx(tx, 'assistant', id);
    });
  }

  remove(id: string): Promise<void> {
    return this.delete(id);
  }

  async reorder(id: string, anchor: OrderRequest): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      const [target] = await tx
        .select({ id: assistantTable.id })
        .from(assistantTable)
        .where(and(eq(assistantTable.id, id), isNull(assistantTable.deletedAt)))
        .limit(1);

      if (!target) {
        throw DataApiErrorFactory.notFound('Assistant', id);
      }

      await applyMoves(tx, assistantTable, [{ anchor, id }], {
        pkColumn: assistantTable.id,
        scope: isNull(assistantTable.deletedAt),
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
        .select({ id: assistantTable.id })
        .from(assistantTable)
        .where(and(inArray(assistantTable.id, ids), isNull(assistantTable.deletedAt)));

      if (targets.length !== ids.length) {
        const found = new Set(targets.map((target) => target.id));
        const missing = ids.find((targetId) => !found.has(targetId)) ?? ids[0];
        throw DataApiErrorFactory.notFound('Assistant', missing);
      }

      await applyMoves(tx, assistantTable, moves, {
        pkColumn: assistantTable.id,
        scope: isNull(assistantTable.deletedAt),
      });
    });
  }

  private async getActiveRowById(id: string): Promise<AssistantRow> {
    const [row] = await this.db
      .select()
      .from(assistantTable)
      .where(and(eq(assistantTable.id, id), isNull(assistantTable.deletedAt)))
      .limit(1);

    if (!row) {
      throw DataApiErrorFactory.notFound('Assistant', id);
    }

    return row;
  }

  private async resolveCreateModelId(
    tx: TxLike,
    dtoModelId: null | string | undefined,
  ): Promise<null | string> {
    if (dtoModelId !== undefined) {
      if (dtoModelId && !(await this.modelExistsTx(tx, dtoModelId))) {
        throw DataApiErrorFactory.validation(
          { modelId: [`Model '${dtoModelId}' is not registered in user_model`] },
          `Assistant modelId '${dtoModelId}' is not registered - add the model first or pass null`,
        );
      }
      return dtoModelId;
    }

    const preferred = await this.preferenceService.get('chat.default_model_id');
    if (!preferred) {
      return null;
    }

    const [row] = await tx
      .select({ id: userModelTable.id })
      .from(userModelTable)
      .where(eq(userModelTable.id, preferred))
      .limit(1);

    return row ? preferred : null;
  }

  private async getModelName(modelId: null | string | undefined): Promise<null | string> {
    if (!modelId) {
      return null;
    }

    const model = await this.modelService.getById(modelId);
    return model?.name ?? null;
  }

  private async modelExistsTx(tx: TxLike, modelId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: userModelTable.id })
      .from(userModelTable)
      .where(eq(userModelTable.id, modelId))
      .limit(1);

    return Boolean(row);
  }

  private async syncRelationsTx(
    tx: TxLike,
    assistantId: string,
    dto: { mcpServerIds?: string[] },
  ): Promise<void> {
    if (dto.mcpServerIds === undefined) {
      return;
    }

    const existing = (await tx
      .select({ mcpServerId: assistantMcpServerTable.mcpServerId })
      .from(assistantMcpServerTable)
      .where(eq(assistantMcpServerTable.assistantId, assistantId))) as { mcpServerId: string }[];
    const existingIds = new Set(existing.map((row) => row.mcpServerId));
    const desiredIds = new Set(dto.mcpServerIds);
    const toRemove = existing
      .filter((row) => !desiredIds.has(row.mcpServerId))
      .map((row) => row.mcpServerId);
    const toAdd = [...desiredIds].filter((mcpServerId) => !existingIds.has(mcpServerId));

    if (toRemove.length > 0) {
      await tx
        .delete(assistantMcpServerTable)
        .where(
          and(
            eq(assistantMcpServerTable.assistantId, assistantId),
            inArray(assistantMcpServerTable.mcpServerId, toRemove),
          ),
        );
    }

    if (toAdd.length > 0) {
      await tx
        .insert(assistantMcpServerTable)
        .values(toAdd.map((mcpServerId) => ({ assistantId, mcpServerId })));
    }
  }

  private async getRelationIdsByAssistantIds(
    tx: TxLike,
    assistantIds: string[],
  ): Promise<Map<string, AssistantRelationIds>> {
    const uniqueAssistantIds = [...new Set(assistantIds)];
    const result = new Map<string, AssistantRelationIds>();

    for (const assistantId of uniqueAssistantIds) {
      result.set(assistantId, createEmptyRelations());
    }

    if (uniqueAssistantIds.length === 0) {
      return result;
    }

    const [mcpRows, knowledgeRows] = await Promise.all([
      tx
        .select({
          assistantId: assistantMcpServerTable.assistantId,
          mcpServerId: assistantMcpServerTable.mcpServerId,
        })
        .from(assistantMcpServerTable)
        .where(inArray(assistantMcpServerTable.assistantId, uniqueAssistantIds))
        .orderBy(asc(assistantMcpServerTable.assistantId), asc(assistantMcpServerTable.createdAt)),
      tx
        .select({
          assistantId: assistantKnowledgeBaseTable.assistantId,
          knowledgeBaseId: assistantKnowledgeBaseTable.knowledgeBaseId,
        })
        .from(assistantKnowledgeBaseTable)
        .where(inArray(assistantKnowledgeBaseTable.assistantId, uniqueAssistantIds))
        .orderBy(
          asc(assistantKnowledgeBaseTable.assistantId),
          asc(assistantKnowledgeBaseTable.createdAt),
        ),
    ]);

    for (const row of mcpRows) {
      result.get(row.assistantId)?.mcpServerIds.push(row.mcpServerId);
    }
    for (const row of knowledgeRows) {
      result.get(row.assistantId)?.knowledgeBaseIds.push(row.knowledgeBaseId);
    }

    return result;
  }

  private validateName(name: string): void {
    if (!name.trim()) {
      throw DataApiErrorFactory.validation({ name: ['Name is required'] });
    }
  }
}
