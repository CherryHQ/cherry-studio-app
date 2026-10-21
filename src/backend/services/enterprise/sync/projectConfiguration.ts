import { and, eq, inArray, isNotNull, notInArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import type { Database } from '@/backend/data/db/DbService';
import {
  agentGlobalSkillTable,
  agentSkillTable,
  agentTable,
  agentToolBindingTable,
  mcpServerTable,
  userModelTable,
  userProviderTable,
} from '@/backend/data/db/schemas';
import type { InsertAgentGlobalSkillRow } from '@/backend/data/db/schemas/agentGlobalSkill';
import { inferCustomModelReasoning } from '@/backend/data/services/ProviderRegistryService';
import { insertWithOrderKey } from '@/backend/data/services/utils/orderKey';
import { MODEL_CAPABILITY } from '@/shared/data/types/model';

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
  /** Skills whose package changed; unchanged managed Skills keep their rows. */
  publishedSkills: readonly PublishedSkill[];
  /** Every Skill the server still delivers, changed or not. */
  skillRemoteIds: ReadonlySet<string>;
}>;

/**
 * Writes one accepted configuration into the profile database. Removed providers, models, MCP
 * servers and Skills are deleted; a removed Agent is detached and becomes the user's own.
 * Returns the local ids of MCP servers whose connection must be rebuilt.
 */
export async function projectConfiguration(tx: Database, input: ProjectionInput) {
  const { configuration, agents } = input;
  const apiKeys = configuration.apiKey
    ? [{ id: 'enterprise-gateway', key: configuration.apiKey, isEnabled: true }]
    : [];

  // Providers and models: every provider in an enterprise profile belongs to the server.
  const providerIds = configuration.providers.map((provider) => provider.providerId);
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
    const modelIds = provider.models.map((model) => model.id);
    await tx
      .delete(userModelTable)
      .where(
        and(
          eq(userModelTable.providerId, provider.providerId),
          notInArray(userModelTable.id, modelIds),
        ),
      );
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
  const removedServers = await tx
    .select({ id: mcpServerTable.id })
    .from(mcpServerTable)
    .where(
      and(
        isNotNull(mcpServerTable.managedRemoteId),
        notInArray(mcpServerTable.managedRemoteId, [...servers.keys()]),
      ),
    );
  const changedServers = removedServers.map((server) => server.id);
  if (changedServers.length) {
    await tx
      .delete(agentToolBindingTable)
      .where(inArray(agentToolBindingTable.mcpServerId, changedServers));
    await tx.delete(mcpServerTable).where(inArray(mcpServerTable.id, changedServers));
  }
  const serverIds = new Map<string, string>();
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
        await tx.update(mcpServerTable).set(values).where(eq(mcpServerTable.id, existing.id));
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
  await tx
    .delete(agentGlobalSkillTable)
    .where(
      and(
        isNotNull(agentGlobalSkillTable.managedRemoteId),
        notInArray(agentGlobalSkillTable.managedRemoteId, [...input.skillRemoteIds]),
      ),
    );
  for (const { remoteId, ...skill } of input.publishedSkills) {
    const [existing] = await tx
      .select({ id: agentGlobalSkillTable.id })
      .from(agentGlobalSkillTable)
      .where(eq(agentGlobalSkillTable.managedRemoteId, remoteId));
    if (existing) {
      await tx
        .update(agentGlobalSkillTable)
        .set(skill)
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
  const agentRemoteIds = agents.map((setup) => setup.agent.remoteId);
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
      .set({ managedRemoteId: null, instructions: '' })
      .where(inArray(agentTable.id, ids));
    await tx.delete(agentToolBindingTable).where(inArray(agentToolBindingTable.agentId, ids));
  }
  for (const { agent } of agents) {
    const locked = { name: agent.name, instructions: agent.instructions, avatar: agent.avatar };
    const [existing] = await tx
      .select({ id: agentTable.id, model: agentTable.model })
      .from(agentTable)
      .where(eq(agentTable.managedRemoteId, agent.remoteId));
    let id = existing?.id;
    if (id) {
      // Model, mode, approval and capability choices are the user's; only fill a lost model.
      await tx
        .update(agentTable)
        .set({ ...locked, deletedAt: null, ...(existing!.model ? {} : { model: agent.model }) })
        .where(eq(agentTable.id, id));
    } else {
      id = uuidv4();
      await insertWithOrderKey(
        tx,
        agentTable,
        {
          ...locked,
          id,
          model: agent.model,
          toolApprovalMode: agent.toolApprovalMode,
          managedRemoteId: agent.remoteId,
        },
        { pkColumn: agentTable.id },
      );
    }
    await tx.delete(agentSkillTable).where(eq(agentSkillTable.agentId, id));
    const boundSkills = agent.skillRemoteIds.flatMap((remoteId) => {
      const skillId = skillIds.get(remoteId);
      return skillId ? [{ agentId: id, skillId, isEnabled: true }] : [];
    });
    if (boundSkills.length) await tx.insert(agentSkillTable).values(boundSkills);
    await tx.delete(agentToolBindingTable).where(eq(agentToolBindingTable.agentId, id));
    const boundServers = agent.mcpServerRemoteIds.flatMap((remoteId) => {
      const mcpServerId = serverIds.get(remoteId);
      return mcpServerId ? [{ agentId: id, source: 'mcp' as const, mcpServerId }] : [];
    });
    if (boundServers.length) await tx.insert(agentToolBindingTable).values(boundServers);
  }

  const agentIds = await tx
    .select({ id: agentTable.id })
    .from(agentTable)
    .where(isNotNull(agentTable.managedRemoteId));
  return {
    changedServers,
    changedPaths: [
      '/providers',
      '/providers/page',
      ...providerIds.map((id) => `/providers/${id}`),
      '/models',
      '/mcp-servers',
      ...[...serverIds.values(), ...changedServers].map((id) => `/mcp-servers/${id}`),
      '/skills',
      '/agents',
      ...[...agentIds, ...detached].flatMap(({ id }) => [`/agents/${id}`, `/agents/${id}/skills`]),
    ],
  };
}
