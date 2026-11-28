import type { McpExecutableToolDescriptor, McpRuntimeToolSelection } from '@/backend/ai/mcp';
import {
  resolveBuiltInPluginGuides,
  type PluginGuideSnapshot,
} from '@/backend/services/builtInMcp';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import type { McpServer } from '@/shared/data/types/mcpServer';
import { clampMcpToolApproval } from '@/shared/utils/agentToolApproval';

import type { RuntimeMcpNamespace, RuntimeTool } from '../runtime';
import { LOAD_WORKFLOW_TOOL_NAME } from './workflowTool';

type AgentToolBindingResolver = {
  list(agentId: string): Promise<{ items: AgentToolBinding[] }>;
  resolveMcpTool(
    agentId: string,
    input: { serverId: string; rawToolName: string; isToolAvailable: boolean },
  ): Promise<{ approval: 'auto' | 'ask' | 'deny' | null; enabled: boolean }>;
};

type McpRuntimeToolCapability = {
  createRuntimeTools(selections: readonly McpRuntimeToolSelection[]): RuntimeTool[];
  listExecutableToolDescriptors(
    serverId: string,
    onUnavailable?: (warning: string) => void,
    signal?: AbortSignal,
    onDiscoveryIncomplete?: () => void,
  ): Promise<McpExecutableToolDescriptor[]>;
};

export type AgentRuntimeToolResolver = {
  resolve(
    agentId: string,
    onUnavailable?: (warning: string) => void,
    signal?: AbortSignal,
    workspaceFolderId?: string | null,
  ): Promise<{
    tools: RuntimeTool[];
    pluginGuides: readonly PluginGuideSnapshot[];
    mcpNamespaces?: readonly RuntimeMcpNamespace[];
    unavailableServerIds?: readonly string[];
  }>;
};

/**
 * Combine Agent-bound remote MCP tools with globally connected plugins and their guide snapshots.
 * Plugin availability follows the connection, independent of Agent bindings and message mentions.
 * Discovery failures report unavailable capabilities without changing durable bindings.
 */
export function createAgentRuntimeToolResolver(input: {
  bindings: AgentToolBindingResolver;
  servers: { list(): Promise<{ items: McpServer[] }> };
  getMcpRuntime(): McpRuntimeToolCapability;
}): AgentRuntimeToolResolver {
  return {
    async resolve(agentId, onUnavailable, signal, workspaceFolderId) {
      const [{ items }, { items: connectedServers }] = await Promise.all([
        input.bindings.list(agentId),
        input.servers.list(),
      ]);
      const boundServerIds = new Set(
        items.flatMap((binding) => (binding.enabled ? [binding.serverId] : [])),
      );
      const servers = connectedServers.filter(
        (server) =>
          server.isEnabled && (server.origin === 'builtin' || boundServerIds.has(server.id)),
      );
      if (servers.length === 0) {
        return {
          tools: [],
          pluginGuides: [],
          mcpNamespaces: [],
          unavailableServerIds: [],
        };
      }
      const pluginIds = new Set(
        servers.filter((server) => server.origin === 'builtin').map((server) => server.id),
      );

      const mcpRuntime = input.getMcpRuntime();
      const catalogs = await Promise.all(
        servers.map(async ({ id: serverId, name }) => {
          let reported = false;
          let discoveryIncomplete = false;
          try {
            const descriptors = await mcpRuntime.listExecutableToolDescriptors(
              serverId,
              (warning) => {
                reported = true;
                onUnavailable?.(warning);
              },
              signal,
              () => {
                discoveryIncomplete = true;
              },
            );
            return {
              descriptors,
              disconnected: discoveryIncomplete && descriptors.length === 0,
              discoveryIncomplete,
            };
          } catch (error) {
            signal?.throwIfAborted();
            if (!reported) {
              onUnavailable?.(
                `${name}: configured tools could not be loaded. Check the service connection and authorization.`,
              );
            }
            const incomplete = discoveryIncomplete || !isNonRetryableUnavailableError(error);
            return {
              descriptors: [],
              disconnected: incomplete,
              discoveryIncomplete: incomplete,
            };
          }
        }),
      );
      const descriptors = catalogs.flatMap(({ descriptors }) => descriptors);
      const resolutions = await Promise.all(
        descriptors.map(async (descriptor) => ({
          descriptor,
          resolved: pluginIds.has(descriptor.serverId)
            ? { approval: 'ask' as const, enabled: true }
            : await input.bindings.resolveMcpTool(agentId, {
                isToolAvailable: true,
                rawToolName: descriptor.rawToolName,
                serverId: descriptor.serverId,
              }),
        })),
      );
      const selections: McpRuntimeToolSelection[] = resolutions.flatMap(
        ({ descriptor, resolved }) => {
          if (!resolved.enabled || resolved.approval === null) {
            return [];
          }
          const approval = clampMcpToolApproval(resolved.approval);
          if (approval === 'deny') {
            // Denied bindings remain durable configuration but are not part of
            // the executable turn snapshot or the model-visible catalog.
            return [];
          }
          return [
            {
              descriptor,
              // An MCP row on its own is never auto: the shared policy keeps an
              // executable selection at ask. The Host may later promote ask to
              // auto for Agents whose approval mode says so.
              approval,
            },
          ];
        },
      );

      const pluginGuides = resolveBuiltInPluginGuides(
        selections.map(({ descriptor }) => descriptor),
      );
      const guidesByServer = new Map(pluginGuides.map((guide) => [guide.serverId, guide]));
      const usedNames = new Set(['mcp']); // Reserved for tools without a matching server namespace.
      const mcpNamespaces = servers.map((server, index): RuntimeMcpNamespace => {
        const label = server.name.replace(/\s+/g, ' ').trim();
        const base =
          namespaceSlug(label) || `mcp_${namespaceSlug(server.id).slice(0, 8) || 'server'}`;
        let name = base;
        for (let suffix = 2; usedNames.has(name); suffix++) name = `${base}_${suffix}`;
        usedNames.add(name);
        const origin = server.origin === 'builtin' ? 'built-in plugin' : 'remote endpoint';
        const availability = catalogs[index]!.disconnected
          ? ' (currently disconnected or unavailable)'
          : '';
        const guide = guidesByServer.get(server.id);
        return {
          serverId: server.id,
          name,
          description: `MCP server "${label}" (${origin})${availability}.`,
          ...(guide
            ? {
                instructions: `Load workflow "plugin:${server.id}" with ${LOAD_WORKFLOW_TOOL_NAME} in a separate tool round before calling tools in this namespace.`,
              }
            : {}),
        };
      });
      const unavailableServerIds = servers
        .filter((_server, index) => catalogs[index]!.discoveryIncomplete)
        .map((server) => server.id);
      return {
        tools: mcpRuntime.createRuntimeTools(
          selections.map((selection) => ({
            ...selection,
            workspaceFolderId,
            descriptor: {
              ...selection.descriptor,
              ...(selection.descriptor.app
                ? { app: { ...selection.descriptor.app, agentId } }
                : {}),
            },
          })),
        ),
        pluginGuides,
        mcpNamespaces,
        unavailableServerIds,
      };
    },
  };
}

function namespaceSlug(value: string): string {
  const slug =
    value
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.join('_') ?? '';
  if (!slug) return '';
  // Code Mode normalizes leading digits to '_', which could collide across numbered servers.
  return /^[0-9]/.test(slug) ? `mcp_${slug}` : slug;
}

function isNonRetryableUnavailableError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'mcp_tool_unavailable' &&
    'retryable' in error &&
    error.retryable === false
  );
}
