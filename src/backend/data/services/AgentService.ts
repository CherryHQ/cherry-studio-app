import { and, asc, count, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import { type AgentRow, agentTable } from '@/backend/data/db/schemas/agent';
import { agentSkillTable } from '@/backend/data/db/schemas/agentSkill';
import {
  agentKnowledgeBaseTable,
  agentMcpServerTable,
} from '@/backend/data/db/schemas/assistantRelations';
import { agentGlobalSkillTable } from '@/backend/data/db/schemas/agentGlobalSkill';
import { knowledgeBaseTable } from '@/backend/data/db/schemas/knowledge';
import { pinTable } from '@/backend/data/db/schemas/pin';
import { userModelTable } from '@/backend/data/db/schemas/userModel';
import { DataApiErrorFactory } from '@cherrystudio/shared/data/api/errors';
import type { OrderRequest } from '@cherrystudio/shared/data/api/schemas/_endpointHelpers';
import {
  type AgentConfiguration,
  type AgentEntity,
  sanitizeAgentConfiguration,
  type UpdateAgentDto,
} from '@cherrystudio/shared/data/api/schemas/agents';
import type { UniqueModelId } from '@cherrystudio/shared/data/types/model';

import type { PinService } from './PinService';
import type { AgentSessionService } from './AgentSessionService';
import { applyMoves } from './utils/orderKey';
import { nullsToUndefined, timestampToISO } from './utils/rowMappers';

type DbOrTx = any;

function configurationRole(value: unknown): unknown {
  return value && typeof value === 'object'
    ? (value as { builtin_role?: unknown }).builtin_role
    : undefined;
}

function patchConfiguration(
  current: unknown,
  patch: AgentConfiguration | undefined,
): Record<string, unknown> {
  const result =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (key === 'builtin_role') continue;
    if (value === undefined) delete result[key];
    else result[key] = value;
  }
  return result;
}

function rowToAgent(
  row: AgentRow,
  modelName: string | null,
  mcps: string[],
  knowledgeBaseIds: string[],
): AgentEntity {
  const clean = nullsToUndefined(row);
  return {
    ...clean,
    configuration: sanitizeAgentConfiguration(row.configuration).data,
    createdAt: timestampToISO(row.createdAt),
    knowledgeBaseIds,
    mcps,
    model: (clean.model ?? null) as UniqueModelId | null,
    modelName,
    planModel: clean.planModel as UniqueModelId | undefined,
    smallModel: clean.smallModel as UniqueModelId | undefined,
    type: (row.type === 'cherry-claw' ? 'claude-code' : row.type) as AgentEntity['type'],
    updatedAt: timestampToISO(row.updatedAt),
  };
}

export class AgentService {
  constructor(
    private readonly dbService: DbService,
    private readonly sessionService: AgentSessionService,
    private readonly pinService: PinService,
  ) {}

  private get db() {
    return this.dbService.getDb();
  }

  private async hydrate(rows: AgentRow[], tx: DbOrTx = this.db): Promise<AgentEntity[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const modelIds = rows.map((row) => row.model).filter((id): id is string => id !== null);
    const [mcpRows, knowledgeRows, modelRows] = await Promise.all([
      tx
        .select({ agentId: agentMcpServerTable.agentId, id: agentMcpServerTable.mcpServerId })
        .from(agentMcpServerTable)
        .where(inArray(agentMcpServerTable.agentId, ids)),
      tx
        .select({
          agentId: agentKnowledgeBaseTable.agentId,
          id: agentKnowledgeBaseTable.knowledgeBaseId,
        })
        .from(agentKnowledgeBaseTable)
        .where(inArray(agentKnowledgeBaseTable.agentId, ids)),
      modelIds.length
        ? tx
            .select({
              id: userModelTable.id,
              modelId: userModelTable.modelId,
              name: userModelTable.name,
            })
            .from(userModelTable)
            .where(inArray(userModelTable.id, modelIds))
        : Promise.resolve([]),
    ]);
    const mcps = new Map<string, string[]>();
    const knowledge = new Map<string, string[]>();
    for (const relation of mcpRows) {
      const values = mcps.get(relation.agentId) ?? [];
      values.push(relation.id);
      mcps.set(relation.agentId, values);
    }
    for (const relation of knowledgeRows) {
      const values = knowledge.get(relation.agentId) ?? [];
      values.push(relation.id);
      knowledge.set(relation.agentId, values);
    }
    const names = new Map<string, string>(
      modelRows.map((model: { id: string; modelId: string; name: string | null }) => [
        model.id,
        model.name ?? model.modelId,
      ]),
    );
    return rows.map((row) =>
      rowToAgent(
        row,
        row.model ? (names.get(row.model) ?? null) : null,
        mcps.get(row.id) ?? [],
        knowledge.get(row.id) ?? [],
      ),
    );
  }

  async getAgent(id: string): Promise<AgentEntity | null> {
    const [row] = await this.db
      .select()
      .from(agentTable)
      .where(and(eq(agentTable.id, id), isNull(agentTable.deletedAt)))
      .limit(1);
    return row ? ((await this.hydrate([row]))[0] ?? null) : null;
  }

  async listAgents(options: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<{ agents: AgentEntity[]; total: number }> {
    const conditions: SQL[] = [isNull(agentTable.deletedAt)];
    if (options.search) {
      const pattern = `%${options.search.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(
        or(
          sql`${agentTable.name} LIKE ${pattern} ESCAPE '\\'`,
          sql`${agentTable.description} LIKE ${pattern} ESCAPE '\\'`,
        )!,
      );
    }
    const where = and(...conditions);
    const [{ value: total = 0 } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(agentTable)
      .where(where);
    let query = this.db
      .select({ agent: agentTable })
      .from(agentTable)
      .leftJoin(
        pinTable,
        and(eq(pinTable.entityType, 'agent'), eq(pinTable.entityId, agentTable.id)),
      )
      .where(where)
      .orderBy(
        sql`CASE WHEN ${pinTable.orderKey} IS NULL THEN 1 ELSE 0 END`,
        asc(pinTable.orderKey),
        asc(agentTable.orderKey),
        asc(agentTable.id),
      )
      .$dynamic();
    if (options.limit !== undefined) query = query.limit(options.limit);
    if (options.offset !== undefined) query = query.offset(options.offset);
    const rows = await query;
    return { agents: await this.hydrate(rows.map(({ agent }) => agent)), total };
  }

  private async validateKnowledgeBases(tx: DbOrTx, ids: string[]): Promise<void> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return;
    const rows = await tx
      .select({ id: knowledgeBaseTable.id })
      .from(knowledgeBaseTable)
      .where(inArray(knowledgeBaseTable.id, uniqueIds));
    if (rows.length !== uniqueIds.length) {
      throw DataApiErrorFactory.invalidOperation(
        'update agent',
        'a selected knowledge base no longer exists',
      );
    }
  }

  async updateAgent(id: string, updates: UpdateAgentDto): Promise<AgentEntity | null> {
    if (!(await this.getAgent(id))) return null;
    await this.dbService.withWriteTx(async (tx) => {
      const [current] = await tx
        .select()
        .from(agentTable)
        .where(and(eq(agentTable.id, id), isNull(agentTable.deletedAt)))
        .limit(1);
      if (!current) throw DataApiErrorFactory.notFound('Agent', id);
      const values: Partial<AgentRow> = { updatedAt: Date.now() };
      for (const field of [
        'name',
        'description',
        'instructions',
        'model',
        'planModel',
        'smallModel',
        'disabledTools',
      ] as const) {
        if (updates[field] !== undefined) values[field] = updates[field] as never;
      }
      if (updates.configuration !== undefined) {
        const currentRole = configurationRole(current.configuration);
        const incomingRole = configurationRole(updates.configuration);
        if (incomingRole !== undefined && incomingRole !== currentRole) {
          throw DataApiErrorFactory.invalidOperation(
            'update agent',
            'configuration.builtin_role is reserved for system agents',
          );
        }
        values.configuration = patchConfiguration(current.configuration, updates.configuration);
      }
      if (updates.knowledgeBaseIds !== undefined) {
        await this.validateKnowledgeBases(tx, updates.knowledgeBaseIds);
      }
      await tx.update(agentTable).set(values).where(eq(agentTable.id, id));
      if (updates.mcps !== undefined) {
        await tx.delete(agentMcpServerTable).where(eq(agentMcpServerTable.agentId, id));
        if (updates.mcps.length) {
          await tx
            .insert(agentMcpServerTable)
            .values(
              [...new Set(updates.mcps)].map((mcpServerId) => ({ agentId: id, mcpServerId })),
            );
        }
      }
      if (updates.knowledgeBaseIds !== undefined) {
        await tx.delete(agentKnowledgeBaseTable).where(eq(agentKnowledgeBaseTable.agentId, id));
        if (updates.knowledgeBaseIds.length) {
          await tx.insert(agentKnowledgeBaseTable).values(
            [...new Set(updates.knowledgeBaseIds)].map((knowledgeBaseId) => ({
              agentId: id,
              knowledgeBaseId,
            })),
          );
        }
      }
      if (updates.skillUpdates?.length) {
        const skillIds = [...new Set(updates.skillUpdates.map(({ skillId }) => skillId))];
        const skills = await tx
          .select({ id: agentGlobalSkillTable.id })
          .from(agentGlobalSkillTable)
          .where(inArray(agentGlobalSkillTable.id, skillIds));
        if (skills.length !== skillIds.length) {
          throw DataApiErrorFactory.invalidOperation(
            'update agent',
            'a selected skill no longer exists',
          );
        }
        for (const update of updates.skillUpdates) {
          await tx
            .insert(agentSkillTable)
            .values({ agentId: id, isEnabled: update.isEnabled, skillId: update.skillId })
            .onConflictDoUpdate({
              set: { isEnabled: update.isEnabled },
              target: [agentSkillTable.agentId, agentSkillTable.skillId],
            });
        }
      }
    });
    return this.getAgent(id);
  }

  async deleteAgent(
    id: string,
    options: { deleteSessions?: boolean } = {},
  ): Promise<{ deleted: boolean; deletedSessionIds?: string[] }> {
    return this.dbService.withWriteTx(async (tx) => {
      const [agent] = await tx
        .select({ id: agentTable.id })
        .from(agentTable)
        .where(and(eq(agentTable.id, id), isNull(agentTable.deletedAt)))
        .limit(1);
      if (!agent) return { deleted: false };
      const deletedSessionIds =
        options.deleteSessions === true
          ? await this.sessionService.deleteByAgentIdTx(tx, id, { validateAgent: false })
          : undefined;
      await this.pinService.purgeForEntityTx(tx, 'agent', id);
      await tx.delete(agentTable).where(eq(agentTable.id, id));
      return { deleted: true, deletedSessionIds };
    });
  }

  async reorder(id: string, anchor: OrderRequest): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      const [target] = await tx
        .select({ id: agentTable.id })
        .from(agentTable)
        .where(and(eq(agentTable.id, id), isNull(agentTable.deletedAt)))
        .limit(1);
      if (!target) throw DataApiErrorFactory.notFound('Agent', id);
      await applyMoves(tx, agentTable, [{ anchor, id }], { pkColumn: agentTable.id });
    });
  }

  async reorderBatch(moves: { anchor: OrderRequest; id: string }[]): Promise<void> {
    if (!moves.length) return;
    await this.dbService.withWriteTx(async (tx) => {
      const ids = moves.map(({ id }) => id);
      const rows = await tx
        .select({ id: agentTable.id })
        .from(agentTable)
        .where(and(inArray(agentTable.id, ids), isNull(agentTable.deletedAt)));
      if (rows.length !== new Set(ids).size) {
        const found = new Set(rows.map((row: { id: string }) => row.id));
        throw DataApiErrorFactory.notFound(
          'Agent',
          ids.find((id) => !found.has(id)),
        );
      }
      await applyMoves(tx, agentTable, moves, { pkColumn: agentTable.id });
    });
  }
}
