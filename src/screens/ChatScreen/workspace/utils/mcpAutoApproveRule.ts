import { hasMcpServerWildcardRule, withMcpToolRuleCleared } from '@/ai/mcp';
import type { DataServices } from '@/data/services/createDataServices';
import type { McpToolSource } from '@/data/types/mcpServer';

/**
 * Stop asking before running one MCP tool.
 *
 * Deliberately writes through `services.mcpServer.update` rather than the
 * `updateServer` mutation: the mutation invalidates the server, which closes
 * the pooled client and clears the tool cache, and the resume that follows
 * this reads tools cache-only — it would come back without the tool and leave
 * the model's call unanswered. `needsApproval` re-reads the row on every call,
 * so the rule takes effect without touching the cache.
 */
export async function clearMcpToolAutoApproveRule(
  services: Pick<DataServices, 'mcp' | 'mcpServer'>,
  source: McpToolSource,
): Promise<void> {
  const server = await services.mcpServer.getById(source.serverId, 'streamableHttp');
  // Clearing a server-wide rule re-expands it per tool, which needs the full
  // list; every other rule form covers this tool alone.
  const knownToolNames = hasMcpServerWildcardRule(server.disabledAutoApproveTools, server)
    ? (await services.mcp.listToolsForServer(server)).map((tool) => tool.name)
    : [source.rawName];

  await services.mcpServer.update(
    server.id,
    {
      disabledAutoApproveTools: withMcpToolRuleCleared(
        server.disabledAutoApproveTools,
        server,
        source.rawName,
        knownToolNames,
      ),
    },
    'streamableHttp',
  );
}
