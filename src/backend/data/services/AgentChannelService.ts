import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/errors';
import type {
  AgentChannelEntity,
  CreateAgentChannelDto,
  UpdateAgentChannelDto,
} from '@cherrystudio/universal/data/api/schemas/agentChannels';
import type { AgentChannelType } from '@cherrystudio/universal/data/api/schemas/agentChannels';
import { and, eq, inArray, type SQL } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import {
  type AgentChannelRow,
  agentChannelTable,
  agentChannelTaskTable,
} from '@/backend/data/db/schemas/agentChannel';

import { nullsToUndefined, timestampToISO } from './utils/rowMappers';

function normalizeConfig(config: unknown): Record<string, unknown> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  const normalized = { ...(config as Record<string, unknown>) };
  delete normalized.type;
  return normalized;
}

function rowToEntity(row: AgentChannelRow): AgentChannelEntity {
  return {
    ...nullsToUndefined(row),
    config: normalizeConfig(row.config) as AgentChannelEntity['config'],
    createdAt: timestampToISO(row.createdAt),
    permissionMode: row.permissionMode ?? undefined,
    updatedAt: timestampToISO(row.updatedAt),
  } as AgentChannelEntity;
}

export class AgentChannelService {
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

  async listChannels(filters?: {
    agentId?: string;
    type?: AgentChannelType;
  }): Promise<AgentChannelEntity[]> {
    const conditions: SQL[] = [];
    if (filters?.agentId) conditions.push(eq(agentChannelTable.agentId, filters.agentId));
    if (filters?.type) conditions.push(eq(agentChannelTable.type, filters.type));
    const rows = await this.db
      .select()
      .from(agentChannelTable)
      .where(conditions.length ? and(...conditions) : undefined);
    return rows.map(rowToEntity);
  }

  async getChannel(id: string): Promise<AgentChannelEntity | null> {
    const [row] = await this.db
      .select()
      .from(agentChannelTable)
      .where(eq(agentChannelTable.id, id))
      .limit(1);
    return row ? rowToEntity(row) : null;
  }

  async createChannel(data: CreateAgentChannelDto): Promise<AgentChannelEntity> {
    const [row] = await this.dbService.withWriteTx((tx) =>
      tx
        .insert(agentChannelTable)
        .values({
          activeChatIds: data.activeChatIds ?? [],
          agentId: data.agentId,
          config: normalizeConfig(data.config),
          isActive: data.isActive ?? true,
          name: data.name,
          permissionMode: data.permissionMode,
          sessionId: data.sessionId,
          type: data.type,
          workspace: data.workspace,
        })
        .returning(),
    );
    if (!row) {
      throw DataApiErrorFactory.invalidOperation(
        'create channel',
        'database insert returned no row',
      );
    }
    return rowToEntity(row);
  }

  async updateChannel(
    id: string,
    updates: UpdateAgentChannelDto,
  ): Promise<AgentChannelEntity | null> {
    const values = {
      ...updates,
      ...(updates.config === undefined ? {} : { config: normalizeConfig(updates.config) }),
    };
    const [row] = await this.dbService.withWriteTx((tx) =>
      tx.update(agentChannelTable).set(values).where(eq(agentChannelTable.id, id)).returning(),
    );
    return row ? rowToEntity(row) : null;
  }

  async deleteChannel(id: string): Promise<boolean> {
    const rows = await this.dbService.withWriteTx((tx) =>
      tx.delete(agentChannelTable).where(eq(agentChannelTable.id, id)).returning({
        id: agentChannelTable.id,
      }),
    );
    return rows.length > 0;
  }

  async getSubscribedChannels(taskId: string): Promise<AgentChannelEntity[]> {
    const subscriptions = await this.db
      .select({ channelId: agentChannelTaskTable.channelId })
      .from(agentChannelTaskTable)
      .where(eq(agentChannelTaskTable.taskId, taskId));
    if (subscriptions.length === 0) return [];
    const rows = await this.db
      .select()
      .from(agentChannelTable)
      .where(
        inArray(
          agentChannelTable.id,
          subscriptions.map((subscription) => subscription.channelId),
        ),
      );
    return rows.map(rowToEntity);
  }
}

export const agentChannelService = new AgentChannelService();
