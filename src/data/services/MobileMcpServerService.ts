import { and, eq, inArray, ne } from 'drizzle-orm';

import type {
  CreateMcpServerDto,
  ListMcpServersQueryParams,
  UpdateMcpServerDto,
} from '@/data/api/schemas/mcpServers';
import { ListMcpServersQuerySchema } from '@/data/api/schemas/mcpServers';
import type { DbService } from '@/data/db/DbService';
import type { InsertMcpServerRow } from '@/data/db/schemas';
import { assistantMcpServerTable, mcpServerTable } from '@/data/db/schemas';
import { DataApiErrorFactory } from '@/data/types/apiTypes';
import type { McpServer, StreamableHttpMcpServer } from '@/data/types/mcpServer';

import type { McpServerService } from './McpServerService';

type TxLike = any;
const MOBILE_MCP_SERVER_TYPE = 'streamableHttp' as const;

function toMobileServer(server: McpServer): StreamableHttpMcpServer | undefined {
  if (server.type !== MOBILE_MCP_SERVER_TYPE) {
    return undefined;
  }
  if (!server.createdAt || !server.updatedAt) {
    throw new Error(`Persisted MCP server ${server.id} is missing timestamps`);
  }

  return {
    ...server,
    baseUrl: server.baseUrl ?? '',
    createdAt: server.createdAt,
    description: server.description ?? '',
    disabledAutoApproveTools: server.disabledAutoApproveTools ?? [],
    disabledTools: server.disabledTools ?? [],
    headers: server.headers ?? {},
    type: MOBILE_MCP_SERVER_TYPE,
    updatedAt: server.updatedAt,
  };
}

/**
 * Mobile projection over the desktop-compatible MCP server store.
 *
 * Only Streamable HTTP rows are visible or mutable through this service.
 */
export class MobileMcpServerService {
  constructor(
    private readonly dbService: DbService,
    private readonly mcpServerService: McpServerService,
  ) {}

  private get db() {
    return this.dbService.getDb();
  }

  async getById(id: string): Promise<StreamableHttpMcpServer> {
    const server = toMobileServer(await this.mcpServerService.getById(id));
    if (!server) {
      throw DataApiErrorFactory.notFound('McpServer', id);
    }
    return server;
  }

  async list(
    params: ListMcpServersQueryParams = {},
  ): Promise<{ items: StreamableHttpMcpServer[]; total: number }> {
    const query = ListMcpServersQuerySchema.parse(params);
    const result = await this.mcpServerService.list({
      isActive: query.isActive,
      type: MOBILE_MCP_SERVER_TYPE,
    });
    const items = result.items.flatMap((server) => {
      const mobileServer = toMobileServer(server);
      return mobileServer ? [mobileServer] : [];
    });
    items.sort(
      (left, right) =>
        (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
        left.createdAt.localeCompare(right.createdAt),
    );
    return { items, total: items.length };
  }

  async create(dto: CreateMcpServerDto): Promise<StreamableHttpMcpServer> {
    const name = this.validateName(dto.name);
    await this.assertNameAvailable(name);

    const server = await this.mcpServerService.create({
      ...dto,
      name,
      timeout: dto.timeout ?? undefined,
      type: MOBILE_MCP_SERVER_TYPE,
    });
    return this.requireMobileServer(server);
  }

  async update(id: string, dto: UpdateMcpServerDto): Promise<StreamableHttpMcpServer> {
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
      .returning({ id: mcpServerTable.id });
    if (!row) {
      throw DataApiErrorFactory.notFound('McpServer', id);
    }

    return this.getById(row.id);
  }

  async delete(id: string): Promise<void> {
    await this.getById(id);
    await this.mcpServerService.delete(id);
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

  private requireMobileServer(server: McpServer): StreamableHttpMcpServer {
    const mobileServer = toMobileServer(server);
    if (!mobileServer) {
      throw new Error(`MCP server ${server.id} is not Streamable HTTP`);
    }
    return mobileServer;
  }

  private toColumns(dto: Partial<CreateMcpServerDto>): Partial<InsertMcpServerRow> {
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
