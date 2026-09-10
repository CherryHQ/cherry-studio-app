import { and, eq } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import {
  agentToolBindingTable,
  appStateTable,
  mcpServerTable,
  monotonicUpdateTimestamp,
  pluginAuthorizationTable,
} from '@/backend/data/db/schemas';
import {
  PluginCredentialSchema,
  type PluginConnection,
  type PluginCredential,
  type PluginId,
} from '@/shared/data/types/plugin';

export type PluginGrant = { id: string; credential: PluginCredential };

/** Scoped backend persistence: JSON state and credentials share the same SQLite transaction owner. */
export interface PluginAuthorizationStore {
  readState(): Promise<PluginCredential | undefined>;
  writeState(state: PluginCredential): Promise<void>;
  initializeState(
    state: PluginCredential,
    migratedGrant?: { previous: PluginGrant; credential: PluginCredential },
  ): Promise<void>;
  getGrant(authorizationId?: string): Promise<PluginGrant | undefined>;
  updateCredential(
    previous: PluginGrant,
    credential: PluginCredential,
    signal: AbortSignal,
  ): Promise<boolean>;
  commit(
    credential: PluginCredential,
    accountLabel: string,
    state: PluginCredential,
    signal: AbortSignal,
  ): Promise<PluginConnection>;
}

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

  /** Backend-only state, including disabled connections that still own their grant. */
  async getCurrentGrant(pluginId: PluginId, authMethod: string) {
    const [row] = await this.db
      .select({ id: pluginAuthorizationTable.id, credential: pluginAuthorizationTable.credential })
      .from(pluginAuthorizationTable)
      .innerJoin(mcpServerTable, eq(mcpServerTable.authorizationId, pluginAuthorizationTable.id))
      .where(
        and(
          eq(pluginAuthorizationTable.pluginId, pluginId),
          eq(pluginAuthorizationTable.authMethod, authMethod),
          eq(mcpServerTable.builtinId, pluginId),
        ),
      )
      .limit(1);
    return row;
  }

  authorizationStore(
    pluginId: PluginId,
    authMethod: string,
    serverName: string,
  ): PluginAuthorizationStore {
    const key = `plugin-authorization:${pluginId}:${authMethod}`;
    return {
      readState: async () => {
        const [row] = await this.db.select().from(appStateTable).where(eq(appStateTable.key, key));
        return row ? PluginCredentialSchema.parse(row.value) : undefined;
      },
      writeState: async (state) => {
        const value = PluginCredentialSchema.parse(state);
        await this.dbService.withWriteTx(async (tx) => {
          await tx
            .insert(appStateTable)
            .values({ key, value })
            .onConflictDoUpdate({
              target: appStateTable.key,
              set: { value, updatedAt: monotonicUpdateTimestamp(appStateTable.updatedAt) },
            });
        });
      },
      initializeState: async (state, migratedGrant) => {
        const value = PluginCredentialSchema.parse(state);
        await this.dbService.withWriteTx(async (tx) => {
          const [existing] = await tx
            .select()
            .from(appStateTable)
            .where(eq(appStateTable.key, key));
          if (existing) return;
          if (migratedGrant) {
            await tx
              .update(pluginAuthorizationTable)
              .set({
                credential: PluginCredentialSchema.parse(migratedGrant.credential),
                updatedAt: monotonicUpdateTimestamp(pluginAuthorizationTable.updatedAt),
              })
              .where(
                and(
                  eq(pluginAuthorizationTable.id, migratedGrant.previous.id),
                  eq(pluginAuthorizationTable.pluginId, pluginId),
                  eq(pluginAuthorizationTable.authMethod, authMethod),
                  eq(pluginAuthorizationTable.credential, migratedGrant.previous.credential),
                ),
              );
          }
          await tx.insert(appStateTable).values({ key, value });
        });
      },
      getGrant: async (authorizationId) => {
        const grant = await this.getCurrentGrant(pluginId, authMethod);
        return !authorizationId || grant?.id === authorizationId ? grant : undefined;
      },
      updateCredential: async (previous, credential, signal) => {
        const value = PluginCredentialSchema.parse(credential);
        return this.dbService.withWriteTx(async (tx) => {
          signal.throwIfAborted();
          const rows = await tx
            .update(pluginAuthorizationTable)
            .set({
              credential: value,
              updatedAt: monotonicUpdateTimestamp(pluginAuthorizationTable.updatedAt),
            })
            .where(
              and(
                eq(pluginAuthorizationTable.id, previous.id),
                eq(pluginAuthorizationTable.pluginId, pluginId),
                eq(pluginAuthorizationTable.authMethod, authMethod),
                eq(pluginAuthorizationTable.credential, previous.credential),
              ),
            )
            .returning({ id: pluginAuthorizationTable.id });
          signal.throwIfAborted();
          return rows.length === 1;
        });
      },
      commit: (credential, accountLabel, state, signal) =>
        this.connect(
          {
            pluginId,
            authMethod,
            serverName,
            credential,
            accountLabel,
            state,
          },
          signal,
        ),
    };
  }

  async connect(
    input: {
      pluginId: PluginId;
      authMethod: string;
      serverName: string;
      accountLabel: string;
      credential: PluginCredential;
      state?: PluginCredential;
    },
    signal?: AbortSignal,
  ): Promise<PluginConnection> {
    const credential = PluginCredentialSchema.parse(input.credential);
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
          pluginId: input.pluginId,
          authMethod: input.authMethod,
          accountLabel: input.accountLabel,
          credential,
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
              name: input.serverName,
              isEnabled: true,
            })
            .returning();
      if (previous?.authorizationId)
        await tx
          .delete(pluginAuthorizationTable)
          .where(eq(pluginAuthorizationTable.id, previous.authorizationId));
      if (input.state) {
        const value = PluginCredentialSchema.parse(input.state);
        await tx
          .insert(appStateTable)
          .values({
            key: `plugin-authorization:${input.pluginId}:${input.authMethod}`,
            value,
          })
          .onConflictDoUpdate({
            target: appStateTable.key,
            set: { value, updatedAt: monotonicUpdateTimestamp(appStateTable.updatedAt) },
          });
      }
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
