import type {
  CreateMcpServerDto,
  ListMcpServersQueryParams,
  UpdateMcpServerDto,
} from '@/shared/data/api/schemas/mcpServers';
import type { OffsetPaginationResponse } from '@/shared/data/api/types';
import type { StreamableHttpMcpServer } from '@/shared/data/types/mcpServer';

export type McpConnectionConfig = {
  baseUrl: string;
  headers?: Record<string, string>;
};

export type McpToolSummary = {
  description?: string;
  name: string;
};

export type McpServerInfo = {
  instructions?: string;
  name: string;
  title?: string;
  version: string;
};

export type McpServerRuntimeSummary = {
  lastConnectedAt?: number;
  lastError?: string;
  serverName?: string;
  serverTitle?: string;
  serverVersion?: string;
  state: 'connected' | 'connecting' | 'disabled' | 'error';
  toolCount?: number;
};

export type McpUpdateServerResult = {
  server: StreamableHttpMcpServer;
  toolsChanged: boolean;
};

export interface McpBackend {
  createServer(input: CreateMcpServerDto): Promise<StreamableHttpMcpServer>;
  getRuntimeSummaries(
    servers: readonly StreamableHttpMcpServer[],
  ): Promise<Record<string, McpServerRuntimeSummary>>;
  getServer(id: string): Promise<StreamableHttpMcpServer>;
  getServerInfo(config: McpConnectionConfig): Promise<McpServerInfo>;
  invalidate(serverId: string): void;
  listServers(
    query?: ListMcpServersQueryParams,
  ): Promise<OffsetPaginationResponse<StreamableHttpMcpServer>>;
  listTools(serverId: string): Promise<McpToolSummary[]>;
  removeServer(id: string): Promise<void>;
  test(config: McpConnectionConfig): Promise<McpToolSummary[]>;
  updateServer(id: string, input: UpdateMcpServerDto): Promise<McpUpdateServerResult>;
}
