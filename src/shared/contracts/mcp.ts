import type { McpServer } from '@cherrystudio/universal/data/types/mcpServer';

export type McpConnectionConfig = {
  endpointUrl: string;
};

export type McpToolSummary = {
  description?: string;
  name: string;
};

/** Initialization metadata, used to name a server before its first save. */
export type McpServerInfo = {
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

export interface McpModule {
  getRuntimeSummaries(
    servers: readonly McpServer[],
  ): Promise<Record<string, McpServerRuntimeSummary>>;
  getServerInfo(config: McpConnectionConfig): Promise<McpServerInfo>;
  invalidate(serverId: string): void;
  listTools(serverId: string): Promise<McpToolSummary[]>;
  test(config: McpConnectionConfig): Promise<McpToolSummary[]>;
}
