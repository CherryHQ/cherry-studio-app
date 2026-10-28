import { and, asc, desc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import {
  type AgentRow,
  agentTable,
  monotonicUpdateTimestamp,
  userModelTable,
} from '@/backend/data/db/schemas';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import {
  type CreateAgentDto,
  type DeleteAgentResult,
  type ListAgentsQueryParams,
  ListAgentsQuerySchema,
  type UpdateAgentDto,
} from '@/shared/data/api/schemas/agents';
import type { OrderRequest } from '@/shared/data/api/schemas/endpointHelpers';
import { type AgentSkillUpdate, ReplaceAgentSkillsSchema } from '@/shared/data/api/schemas/skills';
import type { OffsetPaginationResponse } from '@/shared/data/api/types';
import {
  type Agent,
  CHERRY_AGENT_AVATAR,
  DEFAULT_AGENT_TOOL_APPROVAL_MODE,
} from '@/shared/data/types/agent';
import { sanitizeDisabledAgentCapabilities } from '@/shared/data/types/agentCapability';
import type { UniqueModelId } from '@/shared/data/types/model';
import { deepEqual } from '@/shared/utils/deepEqual';

import { agentGlobalSkillService } from './AgentGlobalSkillService';
import { assertManagedAgentUpdate, assertUserOwned } from './managedResources';
import { modelService } from './ModelService';
import { applyMoves, insertWithOrderKey } from './utils/orderKey';
import { timestampToISO } from './utils/rowMappers';

type TxLike = any;

/**
 * `avatarUri` is left null here on purpose: resolving it needs the avatar
 * directory, which lives under `backend/services` and is out of this layer's
 * reach. The Data API fills it in before a record leaves the boundary.
 */
function rowToAgent(row: AgentRow, modelName: null | string = null): Agent {
  return {
    avatar: row.avatar,
    avatarUri: null,
    createdAt: timestampToISO(row.createdAt),
    disabledCapabilities: sanitizeDisabledAgentCapabilities(row.disabledCapabilities),
    id: row.id,
    instructions: row.instructions,
    isManaged: row.managedRemoteId !== null,
    mode: row.mode,
    model: row.model as UniqueModelId | null,
    modelName,
    name: row.name,
    orderKey: row.orderKey,
    toolApprovalMode: row.toolApprovalMode,
    updatedAt: timestampToISO(row.updatedAt),
  };
}

export class AgentService {
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

  async getById(id: string, options: { includeDeleted?: boolean } = {}): Promise<Agent> {
    const conditions: SQL[] = [eq(agentTable.id, id)];
    if (!options.includeDeleted) {
      conditions.push(isNull(agentTable.deletedAt));
    }

    const [row] = await this.db
      .select()
      .from(agentTable)
      .where(and(...conditions))
      .limit(1);

    if (!row) {
      throw DataApiErrorFactory.notFound('Agent', id);
    }

    return rowToAgent(row, await this.getModelName(row.model));
  }

  get(id: string): Promise<Agent> {
    return this.getById(id);
  }

  async list(params: ListAgentsQueryParams = {}): Promise<OffsetPaginationResponse<Agent>> {
    const query = ListAgentsQuerySchema.parse(params);
    const offset = (query.page - 1) * query.limit;
    const conditions: SQL[] = [isNull(agentTable.deletedAt)];

    if (query.id !== undefined) {
      conditions.push(eq(agentTable.id, query.id));
    }

    if (query.search) {
      const pattern = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(sql`${agentTable.name} LIKE ${pattern} ESCAPE '\\'`);
    }

    const whereClause = and(...conditions);
    const sortBy = query.sortBy ?? 'orderKey';
    const sortOrder =
      query.sortOrder ?? (sortBy === 'orderKey' || sortBy === 'name' ? 'asc' : 'desc');
    const orderFn = sortOrder === 'asc' ? asc : desc;
    const sortColumn = {
      createdAt: agentTable.createdAt,
      name: agentTable.name,
      orderKey: agentTable.orderKey,
      updatedAt: agentTable.updatedAt,
    }[sortBy];
    const orderByClauses =
      sortBy === 'updatedAt'
        ? [orderFn(sortColumn), asc(agentTable.id)]
        : [orderFn(sortColumn), asc(agentTable.createdAt)];
    const [rows, countRows] = await Promise.all([
      this.db
        .select()
        .from(agentTable)
        .where(whereClause)
        .orderBy(...orderByClauses)
        .limit(query.limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(agentTable)
        .where(whereClause),
    ]);

    const modelNames = await modelService.getNamesByUniqueIds(rows.map((row) => row.model));

    return {
      items: rows.map((row) =>
        rowToAgent(row, row.model ? (modelNames.get(row.model) ?? null) : null),
      ),
      page: query.page,
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  async create(dto: CreateAgentDto): Promise<Agent> {
    this.validateName(dto.name);

    const row = await this.dbService.withWriteTx((tx) => this.insertTx(tx, dto));
    publishDataApiChanges(['/agents', `/agents/${row.id}`]);

    return rowToAgent(row, await this.getModelName(row.model));
  }

  /** Seeds a fresh installation without recreating an Agent the user deleted. */
  async createInitialAgent(dto: CreateAgentDto): Promise<Agent | null> {
    this.validateName(dto.name);

    const row = await this.dbService.withWriteTx(async (tx) => {
      const [existing] = await tx.select({ id: agentTable.id }).from(agentTable).limit(1);
      return existing ? null : this.insertTx(tx, { ...dto, avatar: CHERRY_AGENT_AVATAR });
    });

    if (!row) return null;
    publishDataApiChanges(['/agents', `/agents/${row.id}`]);
    return rowToAgent(row, await this.getModelName(row.model));
  }

  listSkillBindings(id: string) {
    return agentGlobalSkillService.listBindings(id);
  }

  async update(
    id: string,
    dto: UpdateAgentDto,
    options: { expectedUpdatedAt?: string; skillUpdates?: readonly AgentSkillUpdate[] } = {},
  ): Promise<Agent> {
    const skillUpdates =
      options.skillUpdates === undefined
        ? undefined
        : ReplaceAgentSkillsSchema.parse({ updates: options.skillUpdates }).updates;
    const expectedTimestamp =
      options.expectedUpdatedAt === undefined ? undefined : Date.parse(options.expectedUpdatedAt);
    if (expectedTimestamp !== undefined && !Number.isFinite(expectedTimestamp)) {
      throw DataApiErrorFactory.validation({ expectedUpdatedAt: ['Invalid Agent version'] });
    }
    if (dto.name !== undefined) {
      this.validateName(dto.name);
    }

    const { row, changed } = await this.dbService.withWriteTx(async (tx) => {
      const [current] = await tx
        .select()
        .from(agentTable)
        .where(and(eq(agentTable.id, id), isNull(agentTable.deletedAt)))
        .limit(1);
      if (!current) throw DataApiErrorFactory.notFound('Agent', id);
      if (expectedTimestamp !== undefined && current.updatedAt !== expectedTimestamp) {
        throw DataApiErrorFactory.conflict(
          'The Agent changed since it was read. Read it again before editing.',
        );
      }

      // Editors resubmit whole forms. Compare and authorize against the same row we write.
      const updates = Object.fromEntries(
        Object.entries(dto).filter(
          ([field, value]) =>
            value !== undefined && !deepEqual(value, current[field as keyof AgentRow]),
        ),
      ) as Partial<typeof agentTable.$inferInsert>;
      assertManagedAgentUpdate(current.managedRemoteId !== null, [
        ...Object.keys(updates),
        ...(skillUpdates?.length ? ['skills'] : []),
      ]);
      if (Object.keys(updates).length === 0 && !skillUpdates?.length) {
        return { row: current, changed: false };
      }

      if (updates.model && !(await this.modelExistsTx(tx, updates.model))) {
        throw DataApiErrorFactory.validation(
          { model: [`Model '${updates.model}' is not registered in user_model`] },
          `Agent model '${updates.model}' is not registered - add the model first or pass null`,
        );
      }

      const [updated] = await tx
        .update(agentTable)
        .set({
          ...updates,
          updatedAt: monotonicUpdateTimestamp(agentTable.updatedAt),
        })
        .where(
          and(
            eq(agentTable.id, id),
            isNull(agentTable.deletedAt),
            expectedTimestamp === undefined
              ? undefined
              : eq(agentTable.updatedAt, expectedTimestamp),
          ),
        )
        .returning();
      if (!updated) {
        if (expectedTimestamp !== undefined) {
          throw DataApiErrorFactory.conflict(
            'The Agent changed or was deleted while saving. Read it again before editing.',
          );
        }
        throw DataApiErrorFactory.notFound('Agent', id);
      }
      if (skillUpdates?.length) {
        await agentGlobalSkillService.applyBindingUpdatesTx(tx, id, skillUpdates);
      }
      return { row: updated as AgentRow, changed: true };
    });

    if (changed) {
      publishDataApiChanges([
        '/agents',
        `/agents/${id}`,
        ...(skillUpdates?.length ? ['/skills', `/agents/${id}/skills`] : []),
      ]);
    }

    return rowToAgent(row, await this.getModelName(row.model));
  }

  /**
   * The column half of the avatar workflow — the file half lives in
   * `agentAvatarStorage`, which calls this between storing the new image and
   * dropping the old one. Kept off `update()` because the CRUD DTOs
   * deliberately refuse managed file references: a caller must not be able to
   * point the column at an arbitrary string.
   */
  async setAvatar(id: string, avatar: string): Promise<Agent> {
    assertUserOwned((await this.getById(id)).isManaged, 'agent.setAvatar');
    const row = await this.dbService.withWriteTx(async (tx) => {
      const [updated] = await tx
        .update(agentTable)
        .set({
          avatar,
          updatedAt: monotonicUpdateTimestamp(agentTable.updatedAt),
        })
        .where(and(eq(agentTable.id, id), isNull(agentTable.deletedAt)))
        .returning();
      if (!updated) {
        throw DataApiErrorFactory.notFound('Agent', id);
      }
      return updated as AgentRow;
    });

    publishDataApiChanges(['/agents', `/agents/${id}`]);
    return rowToAgent(row, await this.getModelName(row.model));
  }

  /**
   * Soft delete only: the `agent_session.agentId` FK is ON DELETE RESTRICT, so
   * Sessions stay readable against the tombstoned row and never orphan
   * (docs/references/agent/agent-persistence.md).
   */
  async delete(id: string): Promise<DeleteAgentResult> {
    assertUserOwned((await this.getById(id, { includeDeleted: true })).isManaged, 'agent.delete');
    const deleted = await this.dbService.withWriteTx(async (tx) => {
      const [row] = await tx
        .update(agentTable)
        .set({
          deletedAt: Date.now(),
          updatedAt: monotonicUpdateTimestamp(agentTable.updatedAt),
        })
        .where(and(eq(agentTable.id, id), isNull(agentTable.deletedAt)))
        .returning({ id: agentTable.id });
      return Boolean(row);
    });

    if (!deleted) {
      throw DataApiErrorFactory.notFound('Agent', id);
    }

    publishDataApiChanges(['/agents', `/agents/${id}`]);
    return { deleted };
  }

  async reorder(id: string, anchor: OrderRequest): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      const [target] = await tx
        .select({ id: agentTable.id })
        .from(agentTable)
        .where(and(eq(agentTable.id, id), isNull(agentTable.deletedAt)))
        .limit(1);

      if (!target) {
        throw DataApiErrorFactory.notFound('Agent', id);
      }

      await applyMoves(tx, agentTable, [{ anchor, id }], {
        monotonicUpdatedAtColumn: agentTable.updatedAt,
        pkColumn: agentTable.id,
        scope: isNull(agentTable.deletedAt),
      });
    });
    publishDataApiChanges(['/agents', `/agents/${id}`]);
  }

  async reorderBatch(moves: { anchor: OrderRequest; id: string }[]): Promise<void> {
    if (moves.length === 0) {
      return;
    }

    await this.dbService.withWriteTx(async (tx) => {
      const ids = moves.map((move) => move.id);
      const targets = await tx
        .select({ id: agentTable.id })
        .from(agentTable)
        .where(and(inArray(agentTable.id, ids), isNull(agentTable.deletedAt)));

      if (targets.length !== ids.length) {
        const found = new Set(targets.map((target) => target.id));
        const missing = ids.find((targetId) => !found.has(targetId)) ?? ids[0];
        throw DataApiErrorFactory.notFound('Agent', missing);
      }

      await applyMoves(tx, agentTable, moves, {
        monotonicUpdatedAtColumn: agentTable.updatedAt,
        pkColumn: agentTable.id,
        scope: isNull(agentTable.deletedAt),
      });
    });
    publishDataApiChanges(['/agents', ...moves.map(({ id }) => `/agents/${id}`)]);
  }

  private async resolveCreateModelId(
    tx: TxLike,
    dtoModelId: null | string | undefined,
  ): Promise<null | string> {
    if (dtoModelId !== undefined) {
      if (dtoModelId && !(await this.modelExistsTx(tx, dtoModelId))) {
        throw DataApiErrorFactory.validation(
          { model: [`Model '${dtoModelId}' is not registered in user_model`] },
          `Agent model '${dtoModelId}' is not registered - add the model first or pass null`,
        );
      }
      return dtoModelId;
    }

    const preferred = await this.preferenceService.get('agent.default_model_id');
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

  private async insertTx(tx: TxLike, dto: CreateAgentDto): Promise<AgentRow> {
    const modelId = await this.resolveCreateModelId(tx, dto.model);
    return (await insertWithOrderKey(
      tx,
      agentTable,
      {
        ...dto,
        model: modelId,
        toolApprovalMode: dto.toolApprovalMode ?? DEFAULT_AGENT_TOOL_APPROVAL_MODE,
      },
      { pkColumn: agentTable.id, scope: isNull(agentTable.deletedAt) },
    )) as AgentRow;
  }

  private async getModelName(modelId: null | string | undefined): Promise<null | string> {
    if (!modelId) {
      return null;
    }

    // Startup needs only a label. Organization defaults can arrive before the public catalog.
    const names = await modelService.getNamesByUniqueIds([modelId]);
    return names.get(modelId) ?? null;
  }

  private async modelExistsTx(tx: TxLike, modelId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: userModelTable.id })
      .from(userModelTable)
      .where(eq(userModelTable.id, modelId))
      .limit(1);

    return Boolean(row);
  }

  private validateName(name: string): void {
    if (!name.trim()) {
      throw DataApiErrorFactory.validation({ name: ['Name is required'] });
    }
  }
}

export const agentService = new AgentService();
