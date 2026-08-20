import {
  type Assistant,
  DEFAULT_ASSISTANT_SETTINGS,
} from '@cherrystudio/universal/data/types/assistant';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import { and, asc, desc, eq, gte, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import {
  type AssistantRow,
  assistantMcpServerTable,
  assistantTable,
  userModelTable,
} from '@/backend/data/db/schemas';
import type { OrderRequest } from '@/shared/data/api/schemas/_endpointHelpers';
import {
  type CreateAssistantDto,
  type DeleteAssistantResult,
  type ImportAssistantDto,
  type ListAssistantsQueryParams,
  ListAssistantsQuerySchema,
  type UpdateAssistantDto,
} from '@/shared/data/api/schemas/assistants';
import { DataApiErrorFactory, type OffsetPaginationResponse } from '@/shared/data/api/types';

import { modelService } from './ModelService';
import { topicService } from './TopicService';
import { applyMoves, insertWithOrderKey } from './utils/orderKey';
import { timestampToISO } from './utils/rowMappers';

type AssistantRelationIds = Pick<Assistant, 'mcpServerIds'>;
type TxLike = any;

function createEmptyRelations(): AssistantRelationIds {
  return { mcpServerIds: [] };
}

function rowToAssistant(
  row: AssistantRow,
  relations: AssistantRelationIds = createEmptyRelations(),
  modelName: null | string = null,
): Assistant {
  return {
    createdAt: timestampToISO(row.createdAt),
    description: row.description,
    emoji: row.emoji,
    id: row.id,
    mcpServerIds: relations.mcpServerIds,
    modelId: row.modelId as UniqueModelId | null,
    modelName,
    name: row.name,
    orderKey: row.orderKey,
    prompt: row.prompt,
    settings: row.settings,
    updatedAt: timestampToISO(row.updatedAt),
  };
}

export class AssistantService {
  /**
   * Resolved per call rather than injected once, so the instance holds no
   * reference to a particular host generation and a replaced host cannot leave
   * this singleton writing to a closed connection.
   */
  private get dbService() {
    return application.get('DbService');
  }

  private get preferenceService() {
    return application.get('PreferenceService');
  }

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

    const [relations, modelName] = await Promise.all([
      this.getRelationIdsByAssistantIds(this.db, [id]),
      this.getModelName(row.assistant.modelId),
    ]);

    return rowToAssistant(row.assistant, relations.get(id), modelName);
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

    if (query.updatedAtFrom !== undefined) {
      conditions.push(gte(assistantTable.updatedAt, Date.parse(query.updatedAtFrom)));
    }

    const whereClause = and(...conditions);
    const sortBy = query.sortBy ?? 'orderKey';
    const sortOrder =
      query.sortOrder ?? (sortBy === 'orderKey' || sortBy === 'name' ? 'asc' : 'desc');
    const orderFn = sortOrder === 'asc' ? asc : desc;
    const sortColumn = {
      createdAt: assistantTable.createdAt,
      name: assistantTable.name,
      orderKey: assistantTable.orderKey,
      updatedAt: assistantTable.updatedAt,
    }[sortBy];
    const orderByClauses =
      sortBy === 'updatedAt'
        ? [orderFn(sortColumn), asc(assistantTable.id)]
        : [orderFn(sortColumn), asc(assistantTable.createdAt)];
    const [rows, countRows] = await Promise.all([
      this.db
        .select({ assistant: assistantTable, modelName: userModelTable.name })
        .from(assistantTable)
        .leftJoin(userModelTable, eq(assistantTable.modelId, userModelTable.id))
        .where(whereClause)
        .orderBy(...orderByClauses)
        .limit(query.limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(assistantTable)
        .where(whereClause),
    ]);

    const assistantIds = rows.map((row) => row.assistant.id);
    const [relations, modelNames] = await Promise.all([
      this.getRelationIdsByAssistantIds(this.db, assistantIds),
      modelService.getNamesByUniqueIds(rows.map((row) => row.assistant.modelId)),
    ]);

    return {
      items: rows.map((row) =>
        rowToAssistant(
          row.assistant,
          relations.get(row.assistant.id),
          row.assistant.modelId ? (modelNames.get(row.assistant.modelId) ?? null) : null,
        ),
      ),
      page: query.page,
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  async create(dto: CreateAssistantDto): Promise<Assistant> {
    this.validateName(dto.name);

    const row = await this.dbService.withWriteTx((tx) => this.createTx(tx, dto));

    const modelName = await this.getModelName(row.modelId);

    return rowToAssistant(row, { mcpServerIds: [...new Set(dto.mcpServerIds ?? [])] }, modelName);
  }

  async createFromImport(dto: ImportAssistantDto): Promise<Assistant> {
    this.validateName(dto.name);

    const row = await this.dbService.withWriteTx((tx) => this.createTx(tx, dto));

    return rowToAssistant(row, createEmptyRelations(), await this.getModelName(row.modelId));
  }

  async update(id: string, dto: UpdateAssistantDto): Promise<Assistant> {
    const current = await this.getById(id);

    if (dto.name !== undefined) {
      this.validateName(dto.name);
    }

    const { mcpServerIds, settings: settingsPatch, ...columnFields } = dto;
    const updates = Object.fromEntries(
      Object.entries(columnFields).filter(([, value]) => value !== undefined),
    ) as Partial<typeof assistantTable.$inferInsert>;

    if (settingsPatch !== undefined) {
      updates.settings = { ...current.settings, ...settingsPatch };
    }

    const hasColumnUpdates = Object.keys(updates).length > 0;
    const hasMcpUpdates = mcpServerIds !== undefined;

    if (!hasColumnUpdates && !hasMcpUpdates) {
      return current;
    }

    const aliveFilter = and(eq(assistantTable.id, id), isNull(assistantTable.deletedAt));

    const { modelName, row } = await this.dbService.withWriteTx(async (tx) => {
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

      await this.syncRelationsTx(tx, id, { mcpServerIds });

      const nextModelName =
        dto.modelId !== undefined && dto.modelId !== current.modelId
          ? await this.getModelName(dto.modelId)
          : current.modelName;

      return { modelName: nextModelName, row: next };
    });

    return rowToAssistant(
      row,
      { mcpServerIds: hasMcpUpdates ? [...new Set(mcpServerIds)] : current.mcpServerIds },
      modelName,
    );
  }

  async delete(
    id: string,
    options: { deleteTopics?: boolean } = {},
  ): Promise<DeleteAssistantResult> {
    let deletedTopicIds: string[] | undefined;
    const deleted = await this.dbService.withWriteTx(async (tx) => {
      const [row] = await tx
        .update(assistantTable)
        .set({ deletedAt: Date.now() })
        .where(and(eq(assistantTable.id, id), isNull(assistantTable.deletedAt)))
        .returning({ id: assistantTable.id });
      if (!row) {
        return false;
      }

      if (options.deleteTopics === true) {
        deletedTopicIds = await topicService.deleteByAssistantIdTx(tx, id, {
          validateAssistant: false,
        });
      }
      return true;
    });

    if (!deleted) {
      throw DataApiErrorFactory.notFound('Assistant', id);
    }

    return deletedTopicIds === undefined ? { deleted } : { deleted, deletedTopicIds };
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

  private async createTx(tx: TxLike, dto: CreateAssistantDto): Promise<AssistantRow> {
    const modelId = await this.resolveCreateModelId(tx, dto.modelId);
    const { mcpServerIds, ...columnDto } = dto;
    const row = (await insertWithOrderKey(
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

    await this.syncRelationsTx(tx, row.id, { mcpServerIds });

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

    const model = await modelService.getById(modelId);
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

    const mcpRows = (await tx
      .select({
        assistantId: assistantMcpServerTable.assistantId,
        mcpServerId: assistantMcpServerTable.mcpServerId,
      })
      .from(assistantMcpServerTable)
      .where(inArray(assistantMcpServerTable.assistantId, uniqueAssistantIds))
      .orderBy(
        asc(assistantMcpServerTable.assistantId),
        asc(assistantMcpServerTable.createdAt),
      )) as { assistantId: string; mcpServerId: string }[];

    for (const row of mcpRows) {
      result.get(row.assistantId)?.mcpServerIds.push(row.mcpServerId);
    }

    return result;
  }

  private validateName(name: string): void {
    if (!name.trim()) {
      throw DataApiErrorFactory.validation({ name: ['Name is required'] });
    }
  }
}

export const assistantService = new AssistantService();
