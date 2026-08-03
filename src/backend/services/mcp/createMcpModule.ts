import type {
  CreateMcpServerDto,
  McpUpdateServerResult,
  UpdateMcpServerDto,
} from '@cherrystudio/universal/data/api/schemas/mcpServers';
import type { StreamableHttpMcpServer } from '@cherrystudio/universal/data/types/mcpServer';

import type { McpServerMutations } from '@/backend/data/api/handlers/mcpServers';
import type {
  McpModule,
  McpConnectionConfig,
  McpServerInfo,
  McpServerRuntimeSummary,
  McpToolSummary,
} from '@/shared/contracts';

type McpServerData = {
  create(input: CreateMcpServerDto): Promise<StreamableHttpMcpServer>;
  get(id: string): Promise<StreamableHttpMcpServer>;
  remove(id: string): Promise<void>;
  update(id: string, input: UpdateMcpServerDto): Promise<StreamableHttpMcpServer>;
};

type McpRuntime = {
  getRuntimeSummaries(
    servers: readonly StreamableHttpMcpServer[],
  ): Promise<Record<string, McpServerRuntimeSummary>>;
  getServerInfo(config: McpConnectionConfig): Promise<McpServerInfo>;
  invalidate(serverId: string, options?: { preserveSnapshot?: boolean }): void;
  listTools(server: StreamableHttpMcpServer): Promise<McpToolSummary[]>;
  test(config: McpConnectionConfig): Promise<McpToolSummary[]>;
  warm(server: StreamableHttpMcpServer): Promise<void>;
};

export type McpModuleDependencies = {
  runtime: McpRuntime;
  servers: McpServerData;
};

export function createMcpModule(
  dependencies: McpModuleDependencies,
): McpModule & McpServerMutations {
  const createServer = async (input: CreateMcpServerDto): Promise<StreamableHttpMcpServer> => {
    const server = await dependencies.servers.create(input);
    if (server.isActive) {
      void dependencies.runtime.warm(server);
    }
    return server;
  };

  const getRuntimeSummaries = (
    servers: readonly StreamableHttpMcpServer[],
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
      const transportChanged = !hasSameTransport(previous, server);
      toolsChanged = transportChanged;
      const becameActive = !previous.isActive && server.isActive;
      const becameInactive = previous.isActive && !server.isActive;

      if (transportChanged) {
        dependencies.runtime.invalidate(id);
      } else if (becameInactive) {
        dependencies.runtime.invalidate(id, { preserveSnapshot: true });
      }

      if (server.isActive && (transportChanged || becameActive)) {
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
  return input.baseUrl !== undefined || input.headers !== undefined || input.isActive !== undefined;
}

function hasSameTransport(left: StreamableHttpMcpServer, right: StreamableHttpMcpServer): boolean {
  if (left.baseUrl !== right.baseUrl) {
    return false;
  }

  const leftHeaders = Object.entries(left.headers);
  return (
    leftHeaders.length === Object.keys(right.headers).length &&
    leftHeaders.every(([name, value]) => right.headers[name] === value)
  );
}
