import type { McpServer } from '@/shared/data/types/mcpServer';

export type McpConnectionConfig = {
  endpointUrl: string;
  headers?: Record<string, string>;
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

/**
 * The read surface the settings screens consume. Exactly what the UI calls,
 * nothing speculative: mutations travel through the Data API handlers, and
 * runtime invalidation is an implementation detail of those mutations.
 */
export interface McpModule {
  getRuntimeSummaries(
    servers: readonly McpServer[],
  ): Promise<Record<string, McpServerRuntimeSummary>>;
  getServerInfo(config: McpConnectionConfig): Promise<McpServerInfo>;
  listTools(serverId: string): Promise<McpToolSummary[]>;
}
