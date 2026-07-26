/**
 * MCP Server Service - handles complete MCP server entities.
 *
 * Keep this service aligned with desktop
 * `src/main/data/services/McpServerService.ts`. Mobile transport filtering and
 * narrow mutations belong in `MobileMcpServerService`.
 */

import { and, asc, eq, type SQL, sql } from 'drizzle-orm';

import { loggerService } from '@/core/logger/LoggerService';
import type { DbService } from '@/data/db/DbService';
import type { InsertMcpServerRow, McpServerRow } from '@/data/db/schemas';
import { assistantMcpServerTable, mcpServerTable } from '@/data/db/schemas';
import { DataApiErrorFactory, type OffsetPaginationResponse } from '@/data/types/apiTypes';
import type { McpServer, McpServerType } from '@/data/types/mcpServer';

import { nullsToUndefined, timestampToISO } from './utils/rowMappers';

const logger = loggerService.withContext('DataApi:McpServerService');

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

export class McpServerService {
  constructor(private readonly dbService: DbService) {}

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
        .orderBy(asc(mcpServerTable.sortOrder)),
      this.db.select({ count: sql<number>`count(*)` }).from(mcpServerTable).where(whereClause),
    ]);

    return {
      items: rows.map(rowToMcpServer),
      page: 1,
      total: countRows[0]?.count ?? 0,
    };
  }

  async create(dto: CreateMcpServerInput): Promise<McpServer> {
    this.validateName(dto.name);

    const { isActive, sortOrder, ...rest } = dto;
    const [row] = await this.db
      .insert(mcpServerTable)
      .values({
        ...rest,
        isActive: isActive ?? false,
        sortOrder: sortOrder ?? 0,
      } as InsertMcpServerRow)
      .returning();

    logger.info('Created MCP server', { id: row.id, name: row.name });
    return rowToMcpServer(row);
  }

  async update(id: string, dto: UpdateMcpServerInput): Promise<McpServer> {
    const existing = await this.getById(id);
    if (dto.name !== undefined) {
      this.validateName(dto.name);
    }

    const updates = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    ) as Partial<InsertMcpServerRow>;
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

    logger.info('Updated MCP server', { changes: Object.keys(dto), id });
    return rowToMcpServer(row);
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

  async delete(id: string): Promise<void> {
    await this.getById(id);

    await this.dbService.withWriteTx(async (tx) => {
      await tx.delete(assistantMcpServerTable).where(eq(assistantMcpServerTable.mcpServerId, id));
      await tx.delete(mcpServerTable).where(eq(mcpServerTable.id, id));
    });

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

  private validateName(name: string): void {
    if (!name?.trim()) {
      throw DataApiErrorFactory.validation({ name: ['Name is required'] });
    }
  }
}
