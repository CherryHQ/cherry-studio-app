/**
 * MCP Server Service - handles complete MCP server entities.
 *
 * Keep this service aligned with desktop
 * `src/main/data/services/McpServerService.ts`. Passing `streamableHttp` to a
 * transport-aware method applies the narrower mobile contract.
 */

import {
  type CreateMcpServerDto,
  CreateMcpServerSchema,
  type UpdateMcpServerDto,
  UpdateMcpServerSchema,
} from '@cherrystudio/universal/data/api/schemas/mcpServers';
import {
  DataApiErrorFactory,
  type OffsetPaginationResponse,
} from '@cherrystudio/universal/data/api/types';
import type {
  McpServer,
  McpServerType,
  StreamableHttpMcpServer,
} from '@cherrystudio/universal/data/types/mcpServer';
import { and, asc, eq, ne, type SQL, sql } from 'drizzle-orm';

import type { DbService } from '@/backend/data/db/DbService';
import type { InsertMcpServerRow, McpServerRow } from '@/backend/data/db/schemas';
import { mcpServerTable } from '@/backend/data/db/schemas';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { nullsToUndefined, timestampToISO } from './utils/rowMappers';

const logger = loggerService.withContext('DataApi:McpServerService');
const STREAMABLE_HTTP_TYPE = 'streamableHttp' as const;

export type CreateMcpServerInput = Omit<
  McpServer,
  'createdAt' | 'id' | 'isActive' | 'updatedAt'
> & {
  isActive?: boolean;
};

export type UpdateMcpServerInput = Partial<CreateMcpServerInput>;

export type ListMcpServersQuery = {
  id?: string;
  isActive?: boolean;
  type?: McpServerType;
};

type StreamableHttpListQuery = ListMcpServersQuery & { type: typeof STREAMABLE_HTTP_TYPE };

function rowToMcpServer(row: McpServerRow): McpServer {
  const clean = nullsToUndefined(row);
  return {
    ...clean,
    type: clean.type as McpServer['type'],
    installSource: clean.installSource as McpServer['installSource'],
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt),
  };
}

function toStreamableHttpServer(server: McpServer): StreamableHttpMcpServer {
  if (server.type !== STREAMABLE_HTTP_TYPE) {
    throw DataApiErrorFactory.notFound('McpServer', server.id);
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
    type: STREAMABLE_HTTP_TYPE,
    updatedAt: server.updatedAt,
  };
}

export class McpServerService {
  constructor(private readonly dbService: DbService) {}

  private get db() {
    return this.dbService.getDb();
  }

  async getById(
    id: string,
    expectedType: typeof STREAMABLE_HTTP_TYPE,
  ): Promise<StreamableHttpMcpServer>;
  async getById(id: string, expectedType?: McpServerType): Promise<McpServer>;
  async getById(id: string, expectedType?: McpServerType): Promise<McpServer> {
    const conditions = [eq(mcpServerTable.id, id)];
    if (expectedType !== undefined) {
      conditions.push(eq(mcpServerTable.type, expectedType));
    }
    const [row] = await this.db
      .select()
      .from(mcpServerTable)
      .where(and(...conditions))
      .limit(1);

    if (!row) {
      throw DataApiErrorFactory.notFound('McpServer', id);
    }

    const server = rowToMcpServer(row);
    return expectedType === STREAMABLE_HTTP_TYPE ? toStreamableHttpServer(server) : server;
  }

  async list(
    query: StreamableHttpListQuery,
  ): Promise<OffsetPaginationResponse<StreamableHttpMcpServer>>;
  async list(query?: ListMcpServersQuery): Promise<OffsetPaginationResponse<McpServer>>;
  async list(query: ListMcpServersQuery = {}): Promise<OffsetPaginationResponse<McpServer>> {
    const conditions: SQL[] = [];
    if (query.id !== undefined) {
      conditions.push(eq(mcpServerTable.id, query.id));
    }
    if (query.isActive !== undefined) {
      conditions.push(eq(mcpServerTable.isActive, query.isActive));
    }
    if (query.type !== undefined) {
      conditions.push(eq(mcpServerTable.type, query.type));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [rows, countRows] = await Promise.all([
      this.db
        .select()
        .from(mcpServerTable)
        .where(whereClause)
        .orderBy(asc(mcpServerTable.sortOrder), asc(mcpServerTable.createdAt)),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(mcpServerTable)
        .where(whereClause),
    ]);
    const items = rows.map(rowToMcpServer);

    return {
      items: query.type === STREAMABLE_HTTP_TYPE ? items.map(toStreamableHttpServer) : items,
      page: 1,
      total: countRows[0]?.count ?? 0,
    };
  }

  async create(
    dto: CreateMcpServerDto,
    type: typeof STREAMABLE_HTTP_TYPE,
  ): Promise<StreamableHttpMcpServer>;
  async create(dto: CreateMcpServerInput): Promise<McpServer>;
  async create(
    dto: CreateMcpServerDto | CreateMcpServerInput,
    type?: typeof STREAMABLE_HTTP_TYPE,
  ): Promise<McpServer> {
    const input: CreateMcpServerInput =
      type === STREAMABLE_HTTP_TYPE
        ? this.toStreamableHttpCreateInput(CreateMcpServerSchema.parse(dto))
        : (dto as CreateMcpServerInput);
    this.validateName(input.name);
    if (type === STREAMABLE_HTTP_TYPE) {
      await this.assertNameAvailable(input.name);
    }

    const { isActive, sortOrder, ...rest } = input;
    const [row] = await this.db
      .insert(mcpServerTable)
      .values({
        ...rest,
        isActive: isActive ?? false,
        sortOrder: sortOrder ?? 0,
      } as InsertMcpServerRow)
      .returning();

    logger.info('Created MCP server', { id: row.id, name: row.name });
    const server = rowToMcpServer(row);
    return type === STREAMABLE_HTTP_TYPE ? toStreamableHttpServer(server) : server;
  }

  async update(
    id: string,
    dto: UpdateMcpServerDto,
    expectedType: typeof STREAMABLE_HTTP_TYPE,
  ): Promise<StreamableHttpMcpServer>;
  async update(id: string, dto: UpdateMcpServerInput): Promise<McpServer>;
  async update(
    id: string,
    dto: UpdateMcpServerDto | UpdateMcpServerInput,
    expectedType?: typeof STREAMABLE_HTTP_TYPE,
  ): Promise<McpServer> {
    const existing = await this.getById(id, expectedType);
    let updates: Partial<InsertMcpServerRow>;

    if (expectedType === STREAMABLE_HTTP_TYPE) {
      const parsed = UpdateMcpServerSchema.parse(dto);
      const name = parsed.name?.trim();
      if (name !== undefined) {
        this.validateName(name);
        await this.assertNameAvailable(name, id);
      }
      updates = this.toStreamableHttpColumns({
        ...parsed,
        ...(name !== undefined && { name }),
      });
    } else {
      if (dto.name !== undefined) {
        this.validateName(dto.name);
      }
      updates = Object.fromEntries(
        Object.entries(dto).filter(([, value]) => value !== undefined),
      ) as Partial<InsertMcpServerRow>;
    }

    if (Object.keys(updates).length === 0) {
      return existing;
    }

    const conditions = [eq(mcpServerTable.id, id)];
    if (expectedType !== undefined) {
      conditions.push(eq(mcpServerTable.type, expectedType));
    }
    const [row] = await this.db
      .update(mcpServerTable)
      .set(updates)
      .where(and(...conditions))
      .returning();

    if (!row) {
      throw DataApiErrorFactory.notFound('McpServer', id);
    }

    logger.info('Updated MCP server', { changes: Object.keys(dto), id });
    const server = rowToMcpServer(row);
    return expectedType === STREAMABLE_HTTP_TYPE ? toStreamableHttpServer(server) : server;
  }

  async findByIdOrName(idOrName: string): Promise<McpServer | undefined> {
    const [row] = await this.db
      .select()
      .from(mcpServerTable)
      .where(eq(mcpServerTable.id, idOrName))
      .limit(1);
    if (row) {
      return rowToMcpServer(row);
    }

    const [byName] = await this.db
      .select()
      .from(mcpServerTable)
      .where(eq(mcpServerTable.name, idOrName))
      .limit(1);
    return byName ? rowToMcpServer(byName) : undefined;
  }

  async delete(id: string, expectedType?: McpServerType): Promise<void> {
    const conditions = [eq(mcpServerTable.id, id)];
    if (expectedType !== undefined) {
      conditions.push(eq(mcpServerTable.type, expectedType));
    }
    const [deleted] = await this.db
      .delete(mcpServerTable)
      .where(and(...conditions))
      .returning({ id: mcpServerTable.id });
    if (!deleted) {
      throw DataApiErrorFactory.notFound('McpServer', id);
    }

    logger.info('Deleted MCP server', { id });
  }

  async reorder(orderedIds: string[]): Promise<void> {
    await this.dbService.withWriteTx(async (tx) => {
      for (const [sortOrder, id] of orderedIds.entries()) {
        await tx.update(mcpServerTable).set({ sortOrder }).where(eq(mcpServerTable.id, id));
      }
    });

    logger.info('Reordered MCP servers', { count: orderedIds.length });
  }

  private toStreamableHttpCreateInput(dto: CreateMcpServerDto): CreateMcpServerInput {
    return {
      ...dto,
      name: dto.name.trim(),
      timeout: dto.timeout ?? undefined,
      type: STREAMABLE_HTTP_TYPE,
    };
  }

  private toStreamableHttpColumns(dto: UpdateMcpServerDto): Partial<InsertMcpServerRow> {
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

  private validateName(name: string): void {
    if (!name?.trim()) {
      throw DataApiErrorFactory.validation({ name: ['Name is required'] });
    }
  }
}
