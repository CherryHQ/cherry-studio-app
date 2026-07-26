import { and, asc, eq, inArray, ne } from 'drizzle-orm';

import type {
  CreateMcpServerDto,
  ListMcpServersQueryParams,
  UpdateMcpServerDto,
} from '@/data/api/schemas/mcpServers';
import { ListMcpServersQuerySchema } from '@/data/api/schemas/mcpServers';
import type { DbService } from '@/data/db/DbService';
import type { InsertMcpServerRow, McpServerRow } from '@/data/db/schemas';
import { assistantMcpServerTable, mcpServerTable } from '@/data/db/schemas';
import { DataApiErrorFactory } from '@/data/types/apiTypes';
import type { McpServer } from '@/data/types/mcpServer';

import { timestampToISO } from './utils/rowMappers';

type TxLike = any;
const MOBILE_MCP_SERVER_TYPE = 'streamableHttp' as const;

function rowToMcpServer(row: McpServerRow): McpServer {
  return {
    baseUrl: row.baseUrl ?? '',
    createdAt: timestampToISO(row.createdAt),
    description: row.description ?? '',
    disabledAutoApproveTools: row.disabledAutoApproveTools ?? [],
    disabledTools: row.disabledTools ?? [],
    headers: row.headers ?? {},
    id: row.id,
    isActive: row.isActive,
    name: row.name,
    timeout: row.timeout,
    type: MOBILE_MCP_SERVER_TYPE,
    updatedAt: timestampToISO(row.updatedAt),
  };
}

export class McpServerService {
  constructor(private readonly dbService: DbService) {}

  private get db() {
    return this.dbService.getDb();
  }

  async getById(id: string): Promise<McpServer> {
    const [row] = await this.db
      .select()
      .from(mcpServerTable)
      .where(and(eq(mcpServerTable.id, id), eq(mcpServerTable.type, MOBILE_MCP_SERVER_TYPE)))
      .limit(1);

    if (!row) {
      throw DataApiErrorFactory.notFound('McpServer', id);
    }

    return rowToMcpServer(row);
  }

  async list(
    params: ListMcpServersQueryParams = {},
  ): Promise<{ items: McpServer[]; total: number }> {
    const query = ListMcpServersQuerySchema.parse(params);
    const conditions = [eq(mcpServerTable.type, MOBILE_MCP_SERVER_TYPE)];
    if (query.isActive !== undefined) {
      conditions.push(eq(mcpServerTable.isActive, query.isActive));
    }
    const rows = await this.db
      .select()
      .from(mcpServerTable)
      .where(and(...conditions))
      .orderBy(asc(mcpServerTable.sortOrder), asc(mcpServerTable.createdAt));

    return { items: rows.map(rowToMcpServer), total: rows.length };
  }

  async create(dto: CreateMcpServerDto): Promise<McpServer> {
    const name = this.validateName(dto.name);
    await this.assertNameAvailable(name);

    const [row] = await this.db
      .insert(mcpServerTable)
      .values({
        ...this.toColumns({ ...dto, name }),
        type: MOBILE_MCP_SERVER_TYPE,
      } as InsertMcpServerRow)
      .returning();

    return rowToMcpServer(row);
  }

  async update(id: string, dto: UpdateMcpServerDto): Promise<McpServer> {
    await this.getById(id);
    const name = dto.name === undefined ? undefined : this.validateName(dto.name);
    if (name !== undefined) {
      await this.assertNameAvailable(name, id);
    }

    const updates = this.toColumns({ ...dto, ...(name !== undefined && { name }) });
    if (Object.keys(updates).length === 0) {
      return this.getById(id);
    }

    const [row] = await this.db
      .update(mcpServerTable)
      .set(updates)
      .where(and(eq(mcpServerTable.id, id), eq(mcpServerTable.type, MOBILE_MCP_SERVER_TYPE)))
      .returning();

    if (!row) {
      throw DataApiErrorFactory.notFound('McpServer', id);
    }

    return rowToMcpServer(row);
  }

  async delete(id: string): Promise<void> {
    await this.getById(id);

    // Explicit junction cleanup; the ON DELETE CASCADE FK is the safety net.
    await this.dbService.withWriteTx(async (tx) => {
      await tx.delete(assistantMcpServerTable).where(eq(assistantMcpServerTable.mcpServerId, id));
      await tx.delete(mcpServerTable).where(eq(mcpServerTable.id, id));
    });
  }

  /**
   * Replace an assistant's mobile-supported MCP associations inside a write tx.
   * Existing associations to unsupported synchronized transports are retained.
   */
  async syncAssistantServersTx(
    tx: TxLike,
    assistantId: string,
    mcpServerIds: string[],
  ): Promise<void> {
    const desiredIds = [...new Set(mcpServerIds)];
    let desiredSupportedIds: string[] = [];

    if (desiredIds.length > 0) {
      const found = (await tx
        .select({ id: mcpServerTable.id, type: mcpServerTable.type })
        .from(mcpServerTable)
        .where(inArray(mcpServerTable.id, desiredIds))) as { id: string; type: string | null }[];
      if (found.length !== desiredIds.length) {
        const foundIds = new Set(found.map((row) => row.id));
        const missing = desiredIds.find((serverId) => !foundIds.has(serverId));
        throw DataApiErrorFactory.notFound('McpServer', missing ?? desiredIds[0]);
      }
      desiredSupportedIds = found.flatMap((row) =>
        row.type === MOBILE_MCP_SERVER_TYPE ? [row.id] : [],
      );
    }

    const existing = (await tx
      .select({
        mcpServerId: assistantMcpServerTable.mcpServerId,
        type: mcpServerTable.type,
      })
      .from(assistantMcpServerTable)
      .innerJoin(mcpServerTable, eq(assistantMcpServerTable.mcpServerId, mcpServerTable.id))
      .where(eq(assistantMcpServerTable.assistantId, assistantId))) as {
      mcpServerId: string;
      type: string | null;
    }[];
    const existingIds = new Set(existing.map((row) => row.mcpServerId));
    const desiredIdSet = new Set(desiredSupportedIds);
    const toRemove = existing.flatMap((row) =>
      row.type !== MOBILE_MCP_SERVER_TYPE || desiredIdSet.has(row.mcpServerId)
        ? []
        : [row.mcpServerId],
    );
    const toAdd = desiredSupportedIds.filter((serverId) => !existingIds.has(serverId));

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

  private toColumns(dto: Partial<CreateMcpServerDto>): Partial<typeof mcpServerTable.$inferInsert> {
    return Object.fromEntries(
      Object.entries({
        baseUrl: dto.baseUrl,
        description: dto.description,
        disabledAutoApproveTools: dto.disabledAutoApproveTools,
        disabledTools: dto.disabledTools,
        headers: dto.headers,
        isActive: dto.isActive,
        name: dto.name,
        timeout: dto.timeout,
      }).filter(([, value]) => value !== undefined),
    );
  }

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

  private validateName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      throw DataApiErrorFactory.validation({ name: ['Name is required'] });
    }
    return trimmed;
  }
}
