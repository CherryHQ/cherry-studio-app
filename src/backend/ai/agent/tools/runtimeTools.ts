import type { McpExecutableToolDescriptor, McpRuntimeToolSelection } from '@/backend/ai/mcp';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
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
  resolve(agentId: string, onUnavailable?: (warning: string) => void): Promise<RuntimeTool[]>;
};

/**
 * Resolve the current persisted MCP policy into one immutable Runtime catalog.
 * Discovery failures report unavailable capabilities without changing durable bindings.
 */
export function createAgentRuntimeToolResolver(input: {
  bindings: AgentToolBindingResolver;
  getMcpRuntime(): McpRuntimeToolCapability;
}): AgentRuntimeToolResolver {
  return {
    async resolve(agentId, onUnavailable) {
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
