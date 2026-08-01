import type { StreamableHttpMcpServer } from '@cherrystudio/shared/data/types/mcpServer';

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

export interface McpBackend {
  getRuntimeSummaries(
    servers: readonly StreamableHttpMcpServer[],
  ): Promise<Record<string, McpServerRuntimeSummary>>;
  getServerInfo(config: McpConnectionConfig): Promise<McpServerInfo>;
  invalidate(serverId: string): void;
  listTools(serverId: string): Promise<McpToolSummary[]>;
  test(config: McpConnectionConfig): Promise<McpToolSummary[]>;
}
