import { and, eq, inArray, isNotNull, notInArray, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import type { Database } from '@/backend/data/db/DbService';
import {
  agentGlobalSkillTable,
  agentSkillTable,
  agentTable,
  agentToolBindingTable,
  mcpServerTable,
  monotonicUpdateTimestamp,
  userModelTable,
  userProviderTable,
} from '@/backend/data/db/schemas';
import type { InsertAgentGlobalSkillRow } from '@/backend/data/db/schemas/agentGlobalSkill';
import { inferCustomModelReasoning } from '@/backend/data/services/ProviderRegistryService';
import { insertWithOrderKey } from '@/backend/data/services/utils/orderKey';
import { MODEL_CAPABILITY, type UniqueModelId } from '@/shared/data/types/model';

import type {
  AgentSetup,
  EnterpriseConfiguration,
  ManagedMcpServer,
} from './enterpriseConfiguration';

/** A Skill package already published to storage, ready for its library row. */
export type PublishedSkill = Readonly<
  { remoteId: string } & Omit<InsertAgentGlobalSkillRow, 'id' | 'managedRemoteId' | 'isEnabled'>
>;

export type ProjectionInput = Readonly<{
  configuration: EnterpriseConfiguration;
  agents: readonly AgentSetup[];
  /** Listed Agents whose setup could not be read: they and what they bind stay as installed. */
  unreadAgentIds: readonly string[];
  /** Skills whose package changed; unchanged managed Skills keep their rows. */
  publishedSkills: readonly PublishedSkill[];
}>;

/**
 * Writes one accepted configuration into the profile database. Removed providers, models, MCP
 * servers and Skills are deleted; a removed Agent is detached and becomes the user's own.
 * Returns the local ids of MCP servers whose connection must be rebuilt and the remote ids of the
 * managed Skills installed afterwards.
 */
export async function projectConfiguration(tx: Database, input: ProjectionInput) {
  const { configuration, agents } = input;
  const unread = await boundByUnreadAgents(tx, input.unreadAgentIds);
  const agentsWithRemovedBindings: { id: string }[] = [];
  const apiKeys = configuration.apiKey
    ? [{ id: 'enterprise-gateway', key: configuration.apiKey, isEnabled: true }]
    : [];

  // Providers and models: every provider in an enterprise profile belongs to the server.
  const providerIds = configuration.providerIds;
  const removedModels = or(
    notInArray(userModelTable.id, configuration.modelIds),
    notInArray(userModelTable.providerId, providerIds),
  );
  const agentsWithRemovedModels = await tx
    .update(agentTable)
    .set({ updatedAt: monotonicUpdateTimestamp(agentTable.updatedAt) })
    .where(
      inArray(
        agentTable.model,
        tx.select({ id: userModelTable.id }).from(userModelTable).where(removedModels),
      ),
    )
    .returning({ id: agentTable.id });
  await tx.delete(userModelTable).where(removedModels);
  await tx.delete(userProviderTable).where(notInArray(userProviderTable.providerId, providerIds));
  for (const provider of configuration.providers) {
    const values = {
      presetProviderId: provider.presetProviderId,
      name: provider.name,
      logoKey:
        provider.providerId === provider.presetProviderId
          ? null
          : `icon:${provider.presetProviderId}`,
      endpointConfigs: provider.endpointConfigs,
      defaultChatEndpoint: provider.defaultChatEndpoint,
      apiKeys,
      authConfig: { type: 'api-key' as const },
      apiFeatures: null,
      providerSettings: null,
      isEnabled: true,
    };
    const [existing] = await tx
      .select({ id: userProviderTable.providerId })
      .from(userProviderTable)
      .where(eq(userProviderTable.providerId, provider.providerId));
    if (existing) {
      await tx
        .update(userProviderTable)
        .set(values)
        .where(eq(userProviderTable.providerId, provider.providerId));
    } else {
      await insertWithOrderKey(
        tx,
        userProviderTable,
        { ...values, providerId: provider.providerId },
        {
          pkColumn: userProviderTable.providerId,
        },
      );
    }
    for (const model of provider.models) {
      const values = {
        providerId: provider.providerId,
        modelId: model.modelId,
        presetModelId: null,
        name: model.name,
        capabilities: model.capabilities,
        endpointTypes: model.endpointTypes,
        supportsStreaming: true,
        reasoning:
          inferCustomModelReasoning(model.modelId, undefined, {
            declaredReasoning: model.capabilities.includes(MODEL_CAPABILITY.REASONING),
          }) ?? null,
        pricing: model.pricing,
        isEnabled: true,
        isHidden: false,
      };
      const [existingModel] = await tx
        .select({ id: userModelTable.id })
        .from(userModelTable)
        .where(eq(userModelTable.id, model.id));
      if (existingModel) {
        await tx.update(userModelTable).set(values).where(eq(userModelTable.id, model.id));
      } else {
        await insertWithOrderKey(
          tx,
          userModelTable,
          { ...values, id: model.id },
          {
            pkColumn: userModelTable.id,
            scope: eq(userModelTable.providerId, provider.providerId),
          },
        );
      }
    }
  }

  // MCP servers: global ones plus every Agent's own servers.
  const servers = new Map<string, ManagedMcpServer>();
  for (const server of [
    ...configuration.mcpServers,
    ...agents.flatMap((setup) => setup.mcpServers),
  ])
    if (!servers.has(server.remoteId)) servers.set(server.remoteId, server);
  const serverRemoteIds = new Set([
    ...configuration.mcpServerRemoteIds,
    ...agents.flatMap((setup) => setup.mcpServerRemoteIds),
    ...unread.serverRemoteIds,
  ]);
  const removedServers = await tx
    .select({ id: mcpServerTable.id })
    .from(mcpServerTable)
    .where(
      and(
        isNotNull(mcpServerTable.managedRemoteId),
        notInArray(mcpServerTable.managedRemoteId, [...serverRemoteIds]),
      ),
    );
  const changedServers = removedServers.map((server) => server.id);
  if (changedServers.length) {
    agentsWithRemovedBindings.push(
      ...(await tx
        .delete(agentToolBindingTable)
        .where(inArray(agentToolBindingTable.mcpServerId, changedServers))
        .returning({ id: agentToolBindingTable.agentId })),
    );
    await tx.delete(mcpServerTable).where(inArray(mcpServerTable.id, changedServers));
  }
  const retainedServers = await tx
    .select({ id: mcpServerTable.id, remoteId: mcpServerTable.managedRemoteId })
    .from(mcpServerTable)
    .where(isNotNull(mcpServerTable.managedRemoteId));
  const serverIds = new Map(retainedServers.map((server) => [server.remoteId!, server.id]));
  for (const server of servers.values()) {
    const values = {
      name: server.name,
      endpointUrl: server.endpointUrl,
      headers: server.headers,
      disabledTools: server.disabledTools,
      isEnabled: server.isEnabled,
    };
    const [existing] = await tx
      .select()
      .from(mcpServerTable)
      .where(eq(mcpServerTable.managedRemoteId, server.remoteId));
    if (existing) {
      if (
        existing.name !== values.name ||
        existing.endpointUrl !== values.endpointUrl ||
        JSON.stringify(existing.headers) !== JSON.stringify(values.headers) ||
        JSON.stringify(existing.disabledTools) !== JSON.stringify(values.disabledTools) ||
        existing.isEnabled !== values.isEnabled
      ) {
        await tx
          .update(mcpServerTable)
          .set({ ...values, updatedAt: monotonicUpdateTimestamp(mcpServerTable.updatedAt) })
          .where(eq(mcpServerTable.id, existing.id));
        changedServers.push(existing.id);
      }
      serverIds.set(server.remoteId, existing.id);
    } else {
      const id = uuidv4();
      await tx
        .insert(mcpServerTable)
        .values({ ...values, id, origin: 'remote', managedRemoteId: server.remoteId });
      serverIds.set(server.remoteId, id);
    }
  }

  // Skills: changed packages replace their row; removed ones go with their bindings.
  const removedSkills = and(
    isNotNull(agentGlobalSkillTable.managedRemoteId),
    notInArray(agentGlobalSkillTable.managedRemoteId, [
      ...agents.flatMap((setup) => setup.skillRemoteIds),
      ...unread.skillRemoteIds,
    ]),
  );
  agentsWithRemovedBindings.push(
    ...(await tx
      .delete(agentSkillTable)
      .where(
        inArray(
          agentSkillTable.skillId,
          tx
            .select({ id: agentGlobalSkillTable.id })
            .from(agentGlobalSkillTable)
            .where(removedSkills),
        ),
      )
      .returning({ id: agentSkillTable.agentId })),
  );
  await tx.delete(agentGlobalSkillTable).where(removedSkills);
  for (const { remoteId, ...skill } of input.publishedSkills) {
    const [existing] = await tx
      .select({ id: agentGlobalSkillTable.id })
      .from(agentGlobalSkillTable)
      .where(eq(agentGlobalSkillTable.managedRemoteId, remoteId));
    if (existing) {
      await tx
        .update(agentGlobalSkillTable)
        .set({ ...skill, updatedAt: monotonicUpdateTimestamp(agentGlobalSkillTable.updatedAt) })
        .where(eq(agentGlobalSkillTable.id, existing.id));
    } else {
      await tx
        .insert(agentGlobalSkillTable)
        .values({ ...skill, id: uuidv4(), managedRemoteId: remoteId, isEnabled: true });
    }
  }
  const skillRows = await tx
    .select({ id: agentGlobalSkillTable.id, remoteId: agentGlobalSkillTable.managedRemoteId })
    .from(agentGlobalSkillTable)
    .where(isNotNull(agentGlobalSkillTable.managedRemoteId));
  const skillIds = new Map(skillRows.map((row) => [row.remoteId!, row.id]));

  // Agents: removed ones detach and keep their conversations as ordinary user Agents.
  const agentRemoteIds = configuration.agentIds.map(String);
  const detached = await tx
    .select({ id: agentTable.id })
    .from(agentTable)
    .where(
      and(
        isNotNull(agentTable.managedRemoteId),
        notInArray(agentTable.managedRemoteId, agentRemoteIds),
      ),
    );
  if (detached.length) {
    const ids = detached.map((agent) => agent.id);
    // Instructions were never shown to the user, so they do not pass to the user's copy.
    await tx
      .update(agentTable)
      .set({
        managedRemoteId: null,
        defaultModelId: null,
        allowedModelIds: null,
        instructions: '',
        updatedAt: monotonicUpdateTimestamp(agentTable.updatedAt),
      })
      .where(inArray(agentTable.id, ids));
    await tx.delete(agentToolBindingTable).where(inArray(agentToolBindingTable.agentId, ids));
    await tx.delete(agentSkillTable).where(inArray(agentSkillTable.agentId, ids));
  }
  for (const { agent, remoteId, skillRemoteIds, mcpServerRemoteIds } of agents) {
    const [existing] = await tx
      .select({
        id: agentTable.id,
        model: agentTable.model,
        defaultModelId: agentTable.defaultModelId,
      })
      .from(agentTable)
      .where(eq(agentTable.managedRemoteId, remoteId));
    if (!agent) {
      if (!existing) continue;
      // A known but unsupported Agent keeps its definition and retained authorizations.
      // Its authoritative setup can still revoke individual bindings to shared resources.
      const retainedSkillIds = skillRemoteIds.flatMap((id) => skillIds.get(id) ?? []);
      const retainedServerIds = mcpServerRemoteIds.flatMap((id) => serverIds.get(id) ?? []);
      agentsWithRemovedBindings.push(
        ...(await tx
          .delete(agentSkillTable)
          .where(
            and(
              eq(agentSkillTable.agentId, existing.id),
              notInArray(agentSkillTable.skillId, retainedSkillIds),
            ),
          )
          .returning({ id: agentSkillTable.agentId })),
      );
      agentsWithRemovedBindings.push(
        ...(await tx
          .delete(agentToolBindingTable)
          .where(
            and(
              eq(agentToolBindingTable.agentId, existing.id),
              eq(agentToolBindingTable.source, 'mcp'),
              notInArray(agentToolBindingTable.mcpServerId, retainedServerIds),
            ),
          )
          .returning({ id: agentToolBindingTable.agentId })),
      );
      continue;
    }
    const locked = {
      name: agent.name,
      instructions: agent.instructions,
      avatar: agent.avatar,
      defaultModelId: agent.defaultModelId,
      allowedModelIds: agent.allowedModelIds,
    };
    const defaultModel = agent.defaultModelId;
    let id = existing?.id;
    if (id) {
      // Mode, approval and capability choices are the user's. So is a model picked from the pool,
      // as on the desktop (`resolveSelectedModel`): a withdrawn pick, or a previous default left
      // in place, follows the server's default.
      const current = existing!.model as UniqueModelId | null;
      const previousDefault = existing!.defaultModelId ?? defaultModel;
      const keepsModel =
        current !== null &&
        agent.allowedModelIds.includes(current) &&
        !(current === previousDefault && current !== defaultModel);
      await tx
        .update(agentTable)
        .set({
          ...locked,
          deletedAt: null,
          updatedAt: monotonicUpdateTimestamp(agentTable.updatedAt),
          ...(keepsModel ? {} : { model: defaultModel }),
        })
        .where(eq(agentTable.id, id));
    } else {
      id = uuidv4();
      await insertWithOrderKey(
        tx,
        agentTable,
        {
          ...locked,
          id,
          model: defaultModel,
          toolApprovalMode: agent.toolApprovalMode,
          managedRemoteId: remoteId,
        },
        { pkColumn: agentTable.id },
      );
    }
    await tx.delete(agentSkillTable).where(eq(agentSkillTable.agentId, id));
    const boundSkills = skillRemoteIds.flatMap((remoteId) => {
      const skillId = skillIds.get(remoteId);
      return skillId ? [{ agentId: id, skillId, isEnabled: true }] : [];
    });
    if (boundSkills.length) await tx.insert(agentSkillTable).values(boundSkills);
    await tx.delete(agentToolBindingTable).where(eq(agentToolBindingTable.agentId, id));
    const boundServers = mcpServerRemoteIds.flatMap((remoteId) => {
      const mcpServerId = serverIds.get(remoteId);
      return mcpServerId ? [{ agentId: id, source: 'mcp' as const, mcpServerId }] : [];
    });
    if (boundServers.length) await tx.insert(agentToolBindingTable).values(boundServers);
  }

  if (agentsWithRemovedBindings.length) {
    await tx
      .update(agentTable)
      .set({ updatedAt: monotonicUpdateTimestamp(agentTable.updatedAt) })
      .where(
        inArray(
          agentTable.id,
          agentsWithRemovedBindings.map(({ id }) => id),
        ),
      );
  }
  const agentIds = await tx
    .select({ id: agentTable.id })
    .from(agentTable)
    .where(isNotNull(agentTable.managedRemoteId));
  return {
    changedServers,
    skillRemoteIds: [...skillIds.keys()],
    changedPaths: [
      '/providers',
      '/providers/page',
      ...providerIds.map((id) => `/providers/${id}`),
      '/models',
      '/mcp-servers',
      ...[...serverIds.values(), ...changedServers].map((id) => `/mcp-servers/${id}`),
      '/skills',
      '/agents',
      ...[
        ...agentIds,
        ...detached,
        ...agentsWithRemovedModels,
        ...agentsWithRemovedBindings,
      ].flatMap(({ id }) => [`/agents/${id}`, `/agents/${id}/skills`]),
    ],
  };
}

/** Managed resources an unread Agent binds. Its setup is unknown, so they are not withdrawn. */
async function boundByUnreadAgents(tx: Database, remoteIds: readonly string[]) {
  if (!remoteIds.length) return { serverRemoteIds: [], skillRemoteIds: [] };
  const agentIds = tx
    .select({ id: agentTable.id })
    .from(agentTable)
    .where(inArray(agentTable.managedRemoteId, [...remoteIds]));
  const servers = await tx
    .select({ remoteId: mcpServerTable.managedRemoteId })
    .from(agentToolBindingTable)
    .innerJoin(mcpServerTable, eq(mcpServerTable.id, agentToolBindingTable.mcpServerId))
    .where(inArray(agentToolBindingTable.agentId, agentIds));
  const skills = await tx
    .select({ remoteId: agentGlobalSkillTable.managedRemoteId })
    .from(agentSkillTable)
    .innerJoin(agentGlobalSkillTable, eq(agentGlobalSkillTable.id, agentSkillTable.skillId))
    .where(inArray(agentSkillTable.agentId, agentIds));
  return {
    serverRemoteIds: servers.flatMap(({ remoteId }) => remoteId ?? []),
    skillRemoteIds: skills.flatMap(({ remoteId }) => remoteId ?? []),
  };
}
