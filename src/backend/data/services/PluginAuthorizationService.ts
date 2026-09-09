import { and, eq } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import {
  agentToolBindingTable,
  mcpServerTable,
  monotonicUpdateTimestamp,
  pluginAuthorizationTable,
} from '@/backend/data/db/schemas';
import type { PluginConnection, PluginId } from '@/shared/contracts/plugins';

/** Owns grant rows and their MCP identities; it never exposes credentials to UI. */
export class PluginAuthorizationService {
  private get dbService() {
    return application.get('DbService');
  }
  private get db() {
    return this.dbService.getDb();
  }

  async listConnections(): Promise<PluginConnection[]> {
    const rows = await this.db
      .select({
        pluginId: pluginAuthorizationTable.pluginId,
        accountLabel: pluginAuthorizationTable.accountLabel,
        connectedAt: pluginAuthorizationTable.createdAt,
        serverId: mcpServerTable.id,
      })
      .from(pluginAuthorizationTable)
      .innerJoin(mcpServerTable, eq(mcpServerTable.authorizationId, pluginAuthorizationTable.id));
    return rows.map((row) => ({
      ...row,
      connectedAt: new Date(row.connectedAt).toISOString(),
    }));
  }

  async getCredentialGrant(pluginId: PluginId, authorizationId: string) {
    const [row] = await this.db
      .select({ grant: pluginAuthorizationTable })
      .from(pluginAuthorizationTable)
      .innerJoin(mcpServerTable, eq(mcpServerTable.authorizationId, pluginAuthorizationTable.id))
      .where(
        and(
          eq(pluginAuthorizationTable.id, authorizationId),
          eq(pluginAuthorizationTable.pluginId, pluginId),
          eq(mcpServerTable.builtinId, pluginId),
          eq(mcpServerTable.isEnabled, true),
        ),
      )
      .limit(1);
    if (!row) throw new Error('Plugin authorization is no longer available.');
    return row.grant;
  }

  async connect(
    input: { pluginId: PluginId; accountLabel: string; credential: string },
    signal?: AbortSignal,
  ): Promise<PluginConnection> {
    return this.dbService.withWriteTx(async (tx) => {
      signal?.throwIfAborted();
      const [previous] = await tx
        .select()
        .from(mcpServerTable)
        .where(eq(mcpServerTable.builtinId, input.pluginId))
        .limit(1);
      const [grant] = await tx
        .insert(pluginAuthorizationTable)
        .values({
          ...input,
          authMethod: input.pluginId === 'github' ? 'personal_token' : 'api_key',
        })
        .returning();
      const [server] = previous
        ? await tx
            .update(mcpServerTable)
            .set({ authorizationId: grant.id, isEnabled: true })
            .where(eq(mcpServerTable.id, previous.id))
            .returning()
        : await tx
            .insert(mcpServerTable)
            .values({
              origin: 'builtin',
              builtinId: input.pluginId,
              authorizationId: grant.id,
              name: input.pluginId === 'github' ? 'GitHub' : '高德地图',
              isEnabled: true,
            })
            .returning();
      if (previous?.authorizationId)
        await tx
          .delete(pluginAuthorizationTable)
          .where(eq(pluginAuthorizationTable.id, previous.authorizationId));
      signal?.throwIfAborted();
      return {
        pluginId: input.pluginId,
        serverId: server.id,
        accountLabel: input.accountLabel,
        connectedAt: new Date(grant.createdAt).toISOString(),
      };
    });
  }

  async disconnect(pluginId: PluginId) {
    return this.dbService.withWriteTx(async (tx) => {
      const [server] = await tx
        .select()
        .from(mcpServerTable)
        .where(eq(mcpServerTable.builtinId, pluginId))
        .limit(1);
      if (!server?.authorizationId) return undefined;
      await tx
        .update(agentToolBindingTable)
        .set({
          enabled: false,
          updatedAt: monotonicUpdateTimestamp(agentToolBindingTable.updatedAt),
        })
        .where(eq(agentToolBindingTable.mcpServerId, server.id));
      await tx.delete(mcpServerTable).where(eq(mcpServerTable.id, server.id));
      await tx
        .delete(pluginAuthorizationTable)
        .where(eq(pluginAuthorizationTable.id, server.authorizationId));
      return { serverId: server.id };
    });
  }
}

export const pluginAuthorizationService = new PluginAuthorizationService();
