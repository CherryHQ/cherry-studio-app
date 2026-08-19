import type {
  CreateMcpServerDto,
  McpUpdateServerResult,
  UpdateMcpServerDto,
} from '@cherrystudio/universal/data/api/schemas/mcpServers';
import type { McpServer } from '@cherrystudio/universal/data/types/mcpServer';

import type { McpServerMutations } from '@/backend/data/api/handlers/mcpServers';
import type {
  McpModule,
  McpConnectionConfig,
  McpServerInfo,
  McpServerRuntimeSummary,
  McpToolSummary,
} from '@/shared/contracts';

type McpServerData = {
  create(input: CreateMcpServerDto): Promise<McpServer>;
  get(id: string): Promise<McpServer>;
  remove(id: string): Promise<void>;
  update(id: string, input: UpdateMcpServerDto): Promise<McpServer>;
};

type McpRuntime = {
  getRuntimeSummaries(
    servers: readonly McpServer[],
  ): Promise<Record<string, McpServerRuntimeSummary>>;
  getServerInfo(config: McpConnectionConfig): Promise<McpServerInfo>;
  invalidate(serverId: string, options?: { preserveSnapshot?: boolean }): void;
  listTools(server: McpServer): Promise<McpToolSummary[]>;
  test(config: McpConnectionConfig): Promise<McpToolSummary[]>;
  warm(server: McpServer): Promise<void>;
};

export type McpModuleDependencies = {
  runtime: McpRuntime;
  servers: McpServerData;
};

export function createMcpModule(
  dependencies: McpModuleDependencies,
): McpModule & McpServerMutations {
  const createServer = async (input: CreateMcpServerDto): Promise<McpServer> => {
    const server = await dependencies.servers.create(input);
    if (server.isEnabled) {
      void dependencies.runtime.warm(server);
    }
    return server;
  };

  const getRuntimeSummaries = (
    servers: readonly McpServer[],
  ): Promise<Record<string, McpServerRuntimeSummary>> =>
    dependencies.runtime.getRuntimeSummaries(servers);

  const getServerInfo = (config: McpConnectionConfig): Promise<McpServerInfo> =>
    dependencies.runtime.getServerInfo(config);

  const invalidate = (serverId: string): void => dependencies.runtime.invalidate(serverId);

  const listTools = async (serverId: string): Promise<McpToolSummary[]> => {
    const server = await dependencies.servers.get(serverId);
    return dependencies.runtime.listTools(server);
  };

  const removeServer = async (id: string): Promise<void> => {
    await dependencies.servers.remove(id);
    dependencies.runtime.invalidate(id);
  };

  const test = (config: McpConnectionConfig): Promise<McpToolSummary[]> =>
    dependencies.runtime.test(config);

  const updateServer = async (
    id: string,
    input: UpdateMcpServerDto,
  ): Promise<McpUpdateServerResult> => {
    if (!id) {
      throw new Error('updateServer requires a server id');
    }

    const previous = hasRuntimeRelevantPatch(input)
      ? await dependencies.servers.get(id)
      : undefined;
    const server = await dependencies.servers.update(id, input);

    let toolsChanged = false;
    if (previous) {
      const transportChanged = previous.endpointUrl !== server.endpointUrl;
      toolsChanged = transportChanged;
      const becameEnabled = !previous.isEnabled && server.isEnabled;
      const becameDisabled = previous.isEnabled && !server.isEnabled;

      if (transportChanged) {
        dependencies.runtime.invalidate(id);
      } else if (becameDisabled) {
        dependencies.runtime.invalidate(id, { preserveSnapshot: true });
      }

      if (server.isEnabled && (transportChanged || becameEnabled)) {
        void dependencies.runtime.warm(server);
      }
    }

    return { server, toolsChanged };
  };

  return {
    createServer,
    getRuntimeSummaries,
    getServerInfo,
    invalidate,
    listTools,
    removeServer,
    test,
    updateServer,
  };
}

function hasRuntimeRelevantPatch(input: UpdateMcpServerDto): boolean {
  return input.endpointUrl !== undefined || input.isEnabled !== undefined;
}
