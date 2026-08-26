import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import * as z from 'zod';

import { application } from '@/backend/core/application/Application';
import type { Database } from '@/backend/data/db/DbService';
import {
  agentTable,
  type AgentToolBindingRow,
  agentToolBindingTable,
  mcpServerTable,
  monotonicUpdateTimestamp,
} from '@/backend/data/db/schemas';
import { DataApiErrorFactory, toDataApiError } from '@/shared/data/api/errors';
import {
  type DeleteAgentToolBindingResult,
  DeleteAgentToolBindingResultSchema,
  ListAgentToolBindingsResponseSchema,
  type ReplaceAgentToolBindingsDto,
  type ReplaceAgentToolBindingsInput,
  ReplaceAgentToolBindingsSchema,
  type WriteAgentToolBinding,
  type WriteAgentToolBindingInput,
  WriteAgentToolBindingSchema,
} from '@/shared/data/api/schemas/agentToolBindings';
import {
  type AgentToolBinding,
  AgentToolBindingSchema,
  type ResolvedAgentMcpToolBinding,
  ResolvedAgentMcpToolBindingSchema,
} from '@/shared/data/types/agentToolBinding';

import { timestampToISO } from './utils/rowMappers';

const ResolveAgentMcpToolBindingInputSchema = z.strictObject({
  isToolAvailable: z.boolean(),
  rawToolName: z.string().min(1),
  serverId: z.uuidv4(),
});
export type ResolveAgentMcpToolBindingInput = z.infer<typeof ResolveAgentMcpToolBindingInputSchema>;

export class AgentToolBindingService {
  private get dbService() {
    return application.get('DbService');
  }

  private get db() {
    return this.dbService.getDb();
  }

  async list(agentId: string): Promise<{ items: AgentToolBinding[] }> {
    await this.assertAgentWritable(this.db, agentId);
    const rows = await this.readRows(this.db, agentId);
    return ListAgentToolBindingsResponseSchema.parse({ items: rows.map(rowToBinding) });
  }

  async upsert(agentId: string, input: WriteAgentToolBindingInput): Promise<AgentToolBinding> {
    const parsed = parseWriteBinding(input);

    const row = await this.dbService.withWriteTx(async (tx) => {
      await this.assertAgentWritable(tx, agentId);
      const existingRows = await this.readRows(tx, agentId);
      const existing = existingRows.find(
        (candidate) => bindingIdentity(candidate) === bindingIdentity(parsed),
      );
      await this.assertMcpTargetsExist(tx, [parsed], existingRows);
      return this.writeBindingTx(tx, agentId, parsed, existing);
    });

    return rowToBinding(row);
  }

  async replace(
    agentId: string,
    input: ReplaceAgentToolBindingsInput,
  ): Promise<{ items: AgentToolBinding[] }> {
    const parsed = parseReplaceBindings(input);
    assertUniqueBindings(parsed.bindings);

    const rows = await this.dbService.withWriteTx(async (tx) => {
      await this.assertAgentWritable(tx, agentId);
      const existingRows = await this.readRows(tx, agentId);
      const existingByIdentity = new Map(
        existingRows.map((row) => [bindingIdentity(row), row] as const),
      );
      await this.assertMcpTargetsExist(tx, parsed.bindings, existingRows);

      const retainedIds: string[] = [];
      const writtenRows: AgentToolBindingRow[] = [];
      for (const binding of parsed.bindings) {
        const row = await this.writeBindingTx(
          tx,
          agentId,
          binding,
          existingByIdentity.get(bindingIdentity(binding)),
        );
        retainedIds.push(row.id);
        writtenRows.push(row);
      }

      const staleIds = existingRows.map((row) => row.id).filter((id) => !retainedIds.includes(id));
      if (staleIds.length > 0) {
        await tx.delete(agentToolBindingTable).where(inArray(agentToolBindingTable.id, staleIds));
      }

      return writtenRows;
    });

    return ListAgentToolBindingsResponseSchema.parse({ items: rows.map(rowToBinding) });
  }

  async delete(agentId: string, bindingId: string): Promise<DeleteAgentToolBindingResult> {
    return this.dbService.withWriteTx(async (tx) => {
      await this.assertAgentWritable(tx, agentId);
      const [deleted] = await tx
        .delete(agentToolBindingTable)
        .where(
          and(eq(agentToolBindingTable.id, bindingId), eq(agentToolBindingTable.agentId, agentId)),
        )
        .returning({ id: agentToolBindingTable.id });
      if (!deleted) {
        throw DataApiErrorFactory.notFound('AgentToolBinding', bindingId);
      }
      return DeleteAgentToolBindingResultSchema.parse({ deleted: true });
    });
  }

  /**
   * Resolves one discovered MCP tool without consulting Runtime state. A specific binding always
   * overrides its server default, including when that specific binding disables the tool.
   */
  async resolveMcpTool(
    agentId: string,
    input: ResolveAgentMcpToolBindingInput,
  ): Promise<ResolvedAgentMcpToolBinding> {
    const parsed = parseResolutionInput(input);
    const { items } = await this.list(agentId);
    const [server] = await this.db
      .select({ isEnabled: mcpServerTable.isEnabled })
      .from(mcpServerTable)
      .where(eq(mcpServerTable.id, parsed.serverId))
      .limit(1);
    const candidates = items.filter(
      (binding): binding is Extract<AgentToolBinding, { source: 'mcp' }> =>
        binding.source === 'mcp' && binding.serverId === parsed.serverId,
    );
    const binding =
      candidates.find((candidate) => candidate.rawToolName === parsed.rawToolName) ??
      candidates.find((candidate) => candidate.rawToolName === undefined) ??
      null;

    const availability = !binding
      ? 'unbound'
      : !server?.isEnabled
        ? 'server-unavailable'
        : !binding.enabled
          ? 'binding-disabled'
          : !parsed.isToolAvailable
            ? 'tool-unavailable'
            : 'available';

    return ResolvedAgentMcpToolBindingSchema.parse({
      approval: binding?.approval ?? null,
      availability,
      binding,
      enabled: availability === 'available',
    });
  }

  private async assertAgentWritable(tx: Database, agentId: string): Promise<void> {
    const [agent] = await tx
      .select({ id: agentTable.id })
      .from(agentTable)
      .where(and(eq(agentTable.id, agentId), isNull(agentTable.deletedAt)))
      .limit(1);
    if (!agent) {
      throw DataApiErrorFactory.notFound('Agent', agentId);
    }
  }

  private readRows(tx: Database, agentId: string): Promise<AgentToolBindingRow[]> {
    return tx
      .select()
      .from(agentToolBindingTable)
      .where(eq(agentToolBindingTable.agentId, agentId))
      .orderBy(asc(agentToolBindingTable.createdAt), asc(agentToolBindingTable.id));
  }

  private async assertMcpTargetsExist(
    tx: Database,
    bindings: readonly WriteAgentToolBinding[],
    existingRows: readonly AgentToolBindingRow[],
  ): Promise<void> {
    const mcpBindings = bindings.filter((binding) => binding.source === 'mcp');
    const serverIds = [...new Set(mcpBindings.map((binding) => binding.serverId))];
    if (serverIds.length === 0) {
      return;
    }

    const servers = await tx
      .select({ id: mcpServerTable.id })
      .from(mcpServerTable)
      .where(inArray(mcpServerTable.id, serverIds));
    const existingServerIds = new Set(servers.map((server) => server.id));
    const existingIdentities = new Set(existingRows.map(bindingIdentity));
    const fieldErrors: Record<string, string[]> = {};

    for (const [index, binding] of bindings.entries()) {
      if (
        binding.source === 'mcp' &&
        !existingServerIds.has(binding.serverId) &&
        !existingIdentities.has(bindingIdentity(binding))
      ) {
        fieldErrors[`bindings.${index}.serverId`] = [
          `MCP server '${binding.serverId}' does not exist; only an existing dangling binding may be preserved`,
        ];
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw DataApiErrorFactory.validation(fieldErrors, 'Cannot authorize a missing MCP server');
    }
  }

  private async writeBindingTx(
    tx: Database,
    agentId: string,
    binding: WriteAgentToolBinding,
    existing?: AgentToolBindingRow,
  ): Promise<AgentToolBindingRow> {
    if (existing) {
      const [updated] = await tx
        .update(agentToolBindingTable)
        .set({
          approval: binding.approval,
          displayNameSnapshot:
            binding.displayNameSnapshot === undefined
              ? existing.displayNameSnapshot
              : binding.displayNameSnapshot,
          enabled: binding.enabled,
          updatedAt: monotonicUpdateTimestamp(agentToolBindingTable.updatedAt),
        })
        .where(eq(agentToolBindingTable.id, existing.id))
        .returning();
      if (!updated) {
        throw DataApiErrorFactory.notFound('AgentToolBinding', existing.id);
      }
      return updated;
    }

    if (binding.source === 'mcp' && binding.approval !== 'ask') {
      throw DataApiErrorFactory.validation(
        { approval: ['A new third-party MCP binding must start with ask approval'] },
        'Cannot create an MCP binding with elevated or denied approval',
      );
    }

    const [created] = await tx
      .insert(agentToolBindingTable)
      .values({
        agentId,
        approval: binding.approval,
        capabilityId: binding.source === 'builtin' ? binding.capabilityId : null,
        displayNameSnapshot: binding.displayNameSnapshot ?? null,
        enabled: binding.enabled,
        mcpServerId: binding.source === 'mcp' ? binding.serverId : null,
        rawToolName: binding.source === 'mcp' ? (binding.rawToolName ?? null) : null,
        source: binding.source,
      })
      .returning();
    return created;
  }
}

function parseWriteBinding(input: WriteAgentToolBindingInput): WriteAgentToolBinding {
  const result = WriteAgentToolBindingSchema.safeParse(input);
  if (!result.success) {
    throw toDataApiError(result.error, 'Agent tool binding upsert');
  }
  return result.data;
}

function parseReplaceBindings(input: ReplaceAgentToolBindingsInput): ReplaceAgentToolBindingsDto {
  const result = ReplaceAgentToolBindingsSchema.safeParse(input);
  if (!result.success) {
    throw toDataApiError(result.error, 'Agent tool binding replace');
  }
  return result.data;
}

function parseResolutionInput(
  input: ResolveAgentMcpToolBindingInput,
): ResolveAgentMcpToolBindingInput {
  const result = ResolveAgentMcpToolBindingInputSchema.safeParse(input);
  if (!result.success) {
    throw toDataApiError(result.error, 'Agent MCP tool binding resolution');
  }
  return result.data;
}

function assertUniqueBindings(bindings: readonly WriteAgentToolBinding[]): void {
  const seen = new Set<string>();
  const fieldErrors: Record<string, string[]> = {};
  for (const [index, binding] of bindings.entries()) {
    const identity = bindingIdentity(binding);
    if (seen.has(identity)) {
      fieldErrors[`bindings.${index}`] = ['Duplicate stable tool identity'];
    }
    seen.add(identity);
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw DataApiErrorFactory.validation(fieldErrors, 'Agent tool bindings contain duplicates');
  }
}

function bindingIdentity(binding: AgentToolBindingRow | WriteAgentToolBinding): string {
  if ('mcpServerId' in binding) {
    return binding.source === 'builtin'
      ? JSON.stringify(['builtin', binding.capabilityId])
      : JSON.stringify(['mcp', binding.mcpServerId, binding.rawToolName ?? null]);
  }

  return binding.source === 'builtin'
    ? JSON.stringify(['builtin', binding.capabilityId])
    : JSON.stringify(['mcp', binding.serverId, binding.rawToolName ?? null]);
}

function rowToBinding(row: AgentToolBindingRow): AgentToolBinding {
  return AgentToolBindingSchema.parse({
    agentId: row.agentId,
    approval: row.approval,
    createdAt: timestampToISO(row.createdAt),
    displayNameSnapshot: row.displayNameSnapshot,
    enabled: row.enabled,
    id: row.id,
    ...(row.source === 'builtin'
      ? { capabilityId: row.capabilityId, source: 'builtin' as const }
      : {
          ...(row.rawToolName === null ? {} : { rawToolName: row.rawToolName }),
          serverId: row.mcpServerId,
          source: 'mcp' as const,
        }),
    updatedAt: timestampToISO(row.updatedAt),
  });
}

export const agentToolBindingService = new AgentToolBindingService();
