import type { McpExecutableToolDescriptor, McpRuntimeToolSelection } from '@/backend/ai/mcp';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import type { McpServer } from '@/shared/data/types/mcpServer';
import { clampMcpToolApproval } from '@/shared/utils/agentToolApproval';

import type { RuntimeTool } from '../runtime';

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
  ): Promise<McpExecutableToolDescriptor[]>;
};

export type AgentRuntimeToolResolver = {
  resolve(
    agentId: string,
    pluginServerIds?: readonly string[],
    onUnavailable?: (warning: string) => void,
  ): Promise<RuntimeTool[]>;
};

/**
 * Combine remote MCP policy with explicitly selected plugins for this message.
 * Legacy Agent bindings never enable plugins; selecting a plugin does not write Agent policy.
 * Discovery failures report unavailable capabilities without changing durable bindings.
 */
export function createAgentRuntimeToolResolver(input: {
  bindings: AgentToolBindingResolver;
  servers: { getById(id: string): Promise<McpServer> };
  getMcpRuntime(): McpRuntimeToolCapability;
}): AgentRuntimeToolResolver {
  return {
    async resolve(agentId, pluginServerIds = [], onUnavailable) {
      const { items } = await input.bindings.list(agentId);
      const boundServerIds = new Set(
        items.flatMap((binding) =>
          binding.source === 'mcp' && binding.enabled ? [binding.serverId] : [],
        ),
      );
      const selectedPluginIds = new Set(pluginServerIds);
      const candidates = await Promise.all(
        [...new Set([...boundServerIds, ...selectedPluginIds])].map(async (id) => {
          try {
            return await input.servers.getById(id);
          } catch {
            return null;
          }
        }),
      );
      const servers = candidates.filter(
        (server): server is McpServer =>
          server !== null &&
          server.isEnabled &&
          (server.origin === 'builtin'
            ? selectedPluginIds.has(server.id)
            : boundServerIds.has(server.id)),
      );
      if (servers.length === 0) {
        return [];
      }
      const pluginIds = new Set(
        servers.filter((server) => server.origin === 'builtin').map((server) => server.id),
      );

      const mcpRuntime = input.getMcpRuntime();
      const catalogs = await Promise.all(
        servers.map(async ({ id: serverId }) => {
          let reported = false;
          try {
            return await mcpRuntime.listExecutableToolDescriptors(serverId, (warning) => {
              reported = true;
              onUnavailable?.(warning);
            });
          } catch {
            if (!reported) {
              const name =
                items.find((binding) => binding.source === 'mcp' && binding.serverId === serverId)
                  ?.displayNameSnapshot ?? serverId;
              onUnavailable?.(
                `${name}: configured tools could not be loaded. Check the service connection and authorization.`,
              );
            }
            return [];
          }
        }),
      );
      const descriptors = catalogs.flat();
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

      return mcpRuntime.createRuntimeTools(selections);
    },
  };
}
