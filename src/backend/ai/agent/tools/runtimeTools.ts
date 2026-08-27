import type { McpExecutableToolDescriptor, McpRuntimeToolSelection } from '@/backend/ai/mcp';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';

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
  listExecutableToolDescriptors(serverId: string): Promise<McpExecutableToolDescriptor[]>;
};

export type AgentRuntimeToolResolver = {
  resolve(agentId: string): Promise<RuntimeTool[]>;
};

/**
 * Resolve the current persisted MCP policy into one immutable Runtime catalog.
 * Discovery failures remove that server from this turn without changing its bindings.
 */
export function createAgentRuntimeToolResolver(input: {
  bindings: AgentToolBindingResolver;
  getMcpRuntime(): McpRuntimeToolCapability;
}): AgentRuntimeToolResolver {
  return {
    async resolve(agentId) {
      const { items } = await input.bindings.list(agentId);
      const serverIds = [
        ...new Set(
          items.flatMap((binding) =>
            binding.source === 'mcp' && binding.enabled ? [binding.serverId] : [],
          ),
        ),
      ];
      if (serverIds.length === 0) {
        return [];
      }

      const mcpRuntime = input.getMcpRuntime();
      const catalogs = await Promise.all(
        serverIds.map(async (serverId) => {
          try {
            return await mcpRuntime.listExecutableToolDescriptors(serverId);
          } catch {
            // Disabled, deleted, unreachable, and otherwise undiscoverable servers
            // fail closed for this snapshot while their durable bindings remain intact.
            return [];
          }
        }),
      );
      const descriptors = catalogs.flat();
      const resolutions = await Promise.all(
        descriptors.map(async (descriptor) => ({
          descriptor,
          resolved: await input.bindings.resolveMcpTool(agentId, {
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
          return [
            {
              descriptor,
              // Mobile never grants third-party MCP automatic approval. Preserve
              // an explicit deny; safely downgrade any legacy auto row to ask.
              approval: resolved.approval === 'deny' ? 'deny' : 'ask',
            },
          ];
        },
      );

      return mcpRuntime.createRuntimeTools(selections);
    },
  };
}
