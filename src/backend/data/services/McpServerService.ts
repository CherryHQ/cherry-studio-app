/**
 * MCP Server Service - CRUD over the stored MCP endpoints.
 *
 * MOBILE SYNC DIVERGENCE: desktop's service manages four transports and an
 * install lifecycle. Mobile stores one Streamable HTTP connection per row, so
 * there is no transport to branch on and no projection to normalize.
 */

import { and, asc, eq, ne, type SQL, sql } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import type { InsertMcpServerRow, McpServerRow } from '@/backend/data/db/schemas';
import {
  agentToolBindingTable,
  mcpServerTable,
  monotonicUpdateTimestamp,
} from '@/backend/data/db/schemas';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import {
  type CreateMcpServerDto,
  CreateMcpServerSchema,
  type UpdateMcpServerDto,
  UpdateMcpServerSchema,
} from '@/shared/data/api/schemas/mcpServers';
import type { OffsetPaginationResponse } from '@/shared/data/api/types';
import type { McpServer } from '@/shared/data/types/mcpServer';

import { timestampToISO } from './utils/rowMappers';

const logger = loggerService.withContext('DataApi:McpServerService');

export type ListMcpServersQuery = {
  id?: string;
  isEnabled?: boolean;
};

function rowToMcpServer(row: McpServerRow): McpServer {
  return {
    createdAt: timestampToISO(row.createdAt),
    disabledTools: row.disabledTools,
    endpointUrl: row.endpointUrl,
    headers: row.headers ?? undefined,
    id: row.id,
    isEnabled: row.isEnabled,
    name: row.name,
    updatedAt: timestampToISO(row.updatedAt),
  };
}

export class McpServerService {
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

  async getById(id: string): Promise<McpServer> {
    const [row] = await this.db
      .select()
      .from(mcpServerTable)
      .where(eq(mcpServerTable.id, id))
      .limit(1);

    if (!row) {
      throw DataApiErrorFactory.notFound('McpServer', id);
    }

    return rowToMcpServer(row);
  }

  async list(query: ListMcpServersQuery = {}): Promise<OffsetPaginationResponse<McpServer>> {
    const conditions: SQL[] = [];
    if (query.id !== undefined) {
      conditions.push(eq(mcpServerTable.id, query.id));
    }
    if (query.isEnabled !== undefined) {
      conditions.push(eq(mcpServerTable.isEnabled, query.isEnabled));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [rows, countRows] = await Promise.all([
      this.db
        .select()
        .from(mcpServerTable)
        .where(whereClause)
        .orderBy(asc(mcpServerTable.createdAt)),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(mcpServerTable)
        .where(whereClause),
    ]);

    return {
      items: rows.map(rowToMcpServer),
      page: 1,
      total: countRows[0]?.count ?? 0,
    };
  }

  async create(dto: CreateMcpServerDto): Promise<McpServer> {
    const parsed = CreateMcpServerSchema.parse(dto);
    const name = parsed.name.trim();
    this.validateName(name);
    await this.assertNameAvailable(name);

    const [row] = await this.db
      .insert(mcpServerTable)
      .values({
        disabledTools: parsed.disabledTools ?? [],
        endpointUrl: parsed.endpointUrl,
        headers: parsed.headers,
        isEnabled: parsed.isEnabled ?? false,
        name,
      })
      .returning();

    logger.info('Created MCP server', { id: row.id, name: row.name });
    return rowToMcpServer(row);
  }

  async update(id: string, dto: UpdateMcpServerDto): Promise<McpServer> {
    const existing = await this.getById(id);
    const parsed = UpdateMcpServerSchema.parse(dto);
    const name = parsed.name?.trim();
    if (name !== undefined) {
      this.validateName(name);
      await this.assertNameAvailable(name, id);
    }

    const updates: Partial<InsertMcpServerRow> = {
      ...(parsed.disabledTools !== undefined && {
        disabledTools: [...new Set(parsed.disabledTools)],
      }),
      ...(parsed.endpointUrl !== undefined && { endpointUrl: parsed.endpointUrl }),
      ...(parsed.headers !== undefined && { headers: parsed.headers }),
      ...(parsed.isEnabled !== undefined && { isEnabled: parsed.isEnabled }),
      ...(name !== undefined && { name }),
    };
    if (Object.keys(updates).length === 0) {
      return existing;
    }

    const [row] = await this.db
      .update(mcpServerTable)
      .set(updates)
      .where(eq(mcpServerTable.id, id))
      .returning();

    if (!row) {
      throw DataApiErrorFactory.notFound('McpServer', id);
    }

    logger.info('Updated MCP server', { changes: Object.keys(updates), id });
    return rowToMcpServer(row);
  }

  async delete(id: string): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      await tx
        .update(agentToolBindingTable)
        .set({
          enabled: false,
          updatedAt: monotonicUpdateTimestamp(agentToolBindingTable.updatedAt),
        })
        .where(eq(agentToolBindingTable.mcpServerId, id));

      const [deleted] = await tx
        .delete(mcpServerTable)
        .where(eq(mcpServerTable.id, id))
        .returning({ id: mcpServerTable.id });
      if (!deleted) {
        throw DataApiErrorFactory.notFound('McpServer', id);
      }
    });

    logger.info('Deleted MCP server', { id });
  }

  /**
   * Names are minted into `mcp__{server}__{tool}` tool ids, so two servers
   * sharing a name would collide in the model-facing toolset.
   */
  private async assertNameAvailable(name: string, excludeId?: string): Promise<void> {
    const conditions = excludeId
      ? and(eq(mcpServerTable.name, name), ne(mcpServerTable.id, excludeId))
      : eq(mcpServerTable.name, name);
    const [existing] = await this.db
      .select({ id: mcpServerTable.id })
      .from(mcpServerTable)
      .where(conditions)
      .limit(1);

    if (existing) {
      throw DataApiErrorFactory.conflict('MCP server name already exists', 'McpServer');
    }
  }

  private validateName(name: string): void {
    if (!name) {
      throw DataApiErrorFactory.validation({ name: ['Name is required'] });
    }
  }
}

export const mcpServerService = new McpServerService();
