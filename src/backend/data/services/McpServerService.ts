/** CRUD for remote MCP connections and shared plugin availability controls.
 * Plugin authorization owns built-in creation, credential changes, and deletion. */

import { and, asc, eq, ne, type SQL, sql } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import type { Database } from '@/backend/data/db/DbService';
import type { InsertMcpServerRow, McpServerRow } from '@/backend/data/db/schemas';
import {
  agentToolBindingTable,
  mcpServerTable,
  monotonicUpdateTimestamp,
} from '@/backend/data/db/schemas';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import {
  type CreateMcpServerDto,
  CreateMcpServerSchema,
  type UpdateMcpServerDto,
  UpdateMcpServerSchema,
} from '@/shared/data/api/schemas/mcpServers';
import type { OffsetPaginationResponse } from '@/shared/data/api/types';
import {
  McpOAuthReferenceSchema,
  McpServerSchema,
  type McpServer,
  type RemoteMcpServer,
} from '@/shared/data/types/mcpServer';

import { timestampToISO } from './utils/rowMappers';

export type ListMcpServersQuery = {
  id?: string;
  isEnabled?: boolean;
};

function rowToMcpServer(row: McpServerRow): McpServer {
  return McpServerSchema.parse({
    origin: row.origin,
    ...(row.origin === 'builtin' && {
      builtinId: row.builtinId,
      authorizationId: row.authorizationId,
    }),
    createdAt: timestampToISO(row.createdAt),
    disabledTools: row.disabledTools,
    endpointUrl: row.endpointUrl,
    headers: row.headers ?? undefined,
    ...(row.origin === 'remote' && row.oauth && { oauth: row.oauth }),
    id: row.id,
    isEnabled: row.isEnabled,
    name: row.name,
    updatedAt: timestampToISO(row.updatedAt),
  });
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

    const [row] = await this.dbService.withWriteTx(async (tx) => {
      await this.assertNameAvailable(tx, name);
      return tx
        .insert(mcpServerTable)
        .values({
          disabledTools: parsed.disabledTools ?? [],
          endpointUrl: parsed.endpointUrl,
          headers: parsed.headers,
          isEnabled: parsed.isEnabled ?? false,
          name,
        })
        .returning();
    });

    return rowToMcpServer(row);
  }

  async update(id: string, dto: UpdateMcpServerDto): Promise<McpServer> {
    const existing = await this.getById(id);
    const parsed = UpdateMcpServerSchema.parse(dto);
    if (
      existing.origin === 'builtin' &&
      (parsed.endpointUrl !== undefined ||
        parsed.headers !== undefined ||
        parsed.name !== undefined)
    ) {
      throw DataApiErrorFactory.validation({ origin: ['Manage this connection from Plugins'] });
    }
    const name = parsed.name?.trim();
    if (name !== undefined) {
      this.validateName(name);
    }

    const updates: Partial<InsertMcpServerRow> = {
      ...(parsed.endpointUrl !== undefined &&
        parsed.endpointUrl !== existing.endpointUrl && { oauth: null }),
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

    const [row] = await this.dbService.withWriteTx(async (tx) => {
      if (parsed.headers !== undefined && updates.oauth !== null) {
        // Read inside the write transaction so a newly attached grant cannot be bypassed.
        const [current] = await tx
          .select({ oauth: mcpServerTable.oauth })
          .from(mcpServerTable)
          .where(eq(mcpServerTable.id, id));
        if (current?.oauth) this.validateOAuthHeaders(parsed.headers);
      }
      if (name !== undefined) {
        await this.assertNameAvailable(tx, name, id);
      }
      return tx.update(mcpServerTable).set(updates).where(eq(mcpServerTable.id, id)).returning();
    });

    if (!row) {
      throw DataApiErrorFactory.notFound('McpServer', id);
    }

    return rowToMcpServer(row);
  }

  /** Only the OAuth workflow can attach a native grant; ordinary DTOs cannot mint one. */
  async saveOAuthConnection(
    input: CreateMcpServerDto,
    oauth: NonNullable<RemoteMcpServer['oauth']>,
    previous?: McpServer,
  ): Promise<McpServer> {
    const parsed = CreateMcpServerSchema.parse(input);
    const reference = McpOAuthReferenceSchema.parse(oauth);
    const name = parsed.name.trim();
    this.validateName(name);
    this.validateOAuthHeaders(parsed.headers);
    const [row] = await this.dbService.withWriteTx(async (tx) => {
      if (previous) {
        const [current] = await tx
          .select()
          .from(mcpServerTable)
          .where(eq(mcpServerTable.id, previous.id));
        if (
          !current ||
          current.origin !== 'remote' ||
          timestampToISO(current.updatedAt) !== previous.updatedAt
        ) {
          throw DataApiErrorFactory.conflict(
            'The MCP connection changed during authorization',
            'McpServer',
          );
        }
      }
      await this.assertNameAvailable(tx, name, previous?.id);
      const values = {
        name,
        endpointUrl: parsed.endpointUrl,
        headers: parsed.headers,
        oauth: reference,
        isEnabled: true,
      };
      return previous
        ? tx
            .update(mcpServerTable)
            .set(values)
            .where(eq(mcpServerTable.id, previous.id))
            .returning()
        : tx.insert(mcpServerTable).values(values).returning();
    });
    return rowToMcpServer(row);
  }

  async disconnectOAuth(id: string): Promise<McpServer> {
    const [row] = await this.dbService.withWriteTx((tx) =>
      tx
        .update(mcpServerTable)
        .set({ oauth: null, isEnabled: false })
        .where(and(eq(mcpServerTable.id, id), eq(mcpServerTable.origin, 'remote')))
        .returning(),
    );
    if (!row) throw DataApiErrorFactory.notFound('McpServer', id);
    return rowToMcpServer(row);
  }

  async delete(id: string): Promise<void> {
    if ((await this.getById(id)).origin === 'builtin') {
      throw DataApiErrorFactory.validation({ origin: ['Disconnect this connection from Plugins'] });
    }
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
  }

  /**
   * Names are minted into `mcp__{server}__{tool}` tool ids, so two servers
   * sharing a name would collide in the model-facing toolset.
   */
  private async assertNameAvailable(tx: Database, name: string, excludeId?: string): Promise<void> {
    const conditions = excludeId
      ? and(eq(mcpServerTable.name, name), ne(mcpServerTable.id, excludeId))
      : eq(mcpServerTable.name, name);
    const [existing] = await tx
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

  private validateOAuthHeaders(headers: Record<string, string> | undefined): void {
    if (Object.keys(headers ?? {}).some((key) => key.toLowerCase() === 'authorization')) {
      throw DataApiErrorFactory.validation({
        headers: ['OAuth cannot be combined with a manual Authorization header'],
      });
    }
  }
}

export const mcpServerService = new McpServerService();
