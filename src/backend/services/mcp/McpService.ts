import type {
  CreateMcpServerDto,
  ListMcpServersQueryParams,
  McpUpdateServerResult,
  UpdateMcpServerDto,
} from '@cherrystudio/universal/data/api/schemas/mcpServers';
import type { OffsetPaginationResponse } from '@cherrystudio/universal/data/api/types';
import type { StreamableHttpMcpServer } from '@cherrystudio/universal/data/types/mcpServer';

import type {
  McpBackend,
  McpConnectionConfig,
  McpServerInfo,
  McpServerRuntimeSummary,
  McpToolSummary,
} from '@/shared/contracts';

type McpServerRepository = {
  create(input: CreateMcpServerDto): Promise<StreamableHttpMcpServer>;
  get(id: string): Promise<StreamableHttpMcpServer>;
  list(
    query?: ListMcpServersQueryParams,
  ): Promise<OffsetPaginationResponse<StreamableHttpMcpServer>>;
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

export type McpServiceDependencies = {
  runtime: McpRuntime;
  servers: McpServerRepository;
};

export class McpService implements McpBackend {
  constructor(private readonly dependencies: McpServiceDependencies) {}

  async createServer(input: CreateMcpServerDto): Promise<StreamableHttpMcpServer> {
    const server = await this.dependencies.servers.create(input);
    if (server.isActive) {
      void this.dependencies.runtime.warm(server);
    }
    return server;
  }

  getRuntimeSummaries(
    servers: readonly StreamableHttpMcpServer[],
  ): Promise<Record<string, McpServerRuntimeSummary>> {
    return this.dependencies.runtime.getRuntimeSummaries(servers);
  }

  getServer(id: string): Promise<StreamableHttpMcpServer> {
    return this.dependencies.servers.get(id);
  }

  getServerInfo(config: McpConnectionConfig): Promise<McpServerInfo> {
    return this.dependencies.runtime.getServerInfo(config);
  }

  invalidate(serverId: string): void {
    this.dependencies.runtime.invalidate(serverId);
  }

  listServers(
    query?: ListMcpServersQueryParams,
  ): Promise<OffsetPaginationResponse<StreamableHttpMcpServer>> {
    return this.dependencies.servers.list(query);
  }

  async listTools(serverId: string): Promise<McpToolSummary[]> {
    const server = await this.dependencies.servers.get(serverId);
    return this.dependencies.runtime.listTools(server);
  }

  async removeServer(id: string): Promise<void> {
    await this.dependencies.servers.remove(id);
    this.dependencies.runtime.invalidate(id);
  }

  test(config: McpConnectionConfig): Promise<McpToolSummary[]> {
    return this.dependencies.runtime.test(config);
  }

  async updateServer(id: string, input: UpdateMcpServerDto): Promise<McpUpdateServerResult> {
    if (!id) {
      throw new Error('updateServer requires a server id');
    }

    const previous = hasRuntimeRelevantPatch(input)
      ? await this.dependencies.servers.get(id)
      : undefined;
    const server = await this.dependencies.servers.update(id, input);

    let toolsChanged = false;
    if (previous) {
      const transportChanged = !hasSameTransport(previous, server);
      toolsChanged = transportChanged;
      const becameActive = !previous.isActive && server.isActive;
      const becameInactive = previous.isActive && !server.isActive;

      if (transportChanged) {
        this.dependencies.runtime.invalidate(id);
      } else if (becameInactive) {
        this.dependencies.runtime.invalidate(id, { preserveSnapshot: true });
      }

      if (server.isActive && (transportChanged || becameActive)) {
        void this.dependencies.runtime.warm(server);
      }
    }

    return { server, toolsChanged };
  }
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
