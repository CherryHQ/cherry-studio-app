import type { McpServer } from '@/shared/data/types/mcpServer';

import type { McpAppLaunch, McpAppChannel, McpAppView, McpAppHostContext } from './mcpApp';
import type { McpResourceReference } from './mcpContent';
import type { McpElicitationResponse, McpPendingElicitation } from './mcpInteraction';

export type McpConnectionConfig = {
  origin?: 'remote';
  endpointUrl: string;
  headers?: Record<string, string>;
  oauth?: { authorizationId: string; clientId: string };
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

/** Negotiated wire version and supported primitives, separate from the server app version. */
export type McpProtocolInfo = {
  version: string;
  tools: boolean;
  resources: boolean;
  prompts: boolean;
};

export type McpServerRuntimeSummary = {
  protocol?: McpProtocolInfo;
  lastConnectedAt?: number;
  lastError?: string;
  serverName?: string;
  serverTitle?: string;
  serverVersion?: string;
  state: 'connected' | 'connecting' | 'disabled' | 'error';
  toolCount?: number;
};

export type McpOAuthStartInput = {
  serverId?: string;
  name: string;
  endpointUrl: string;
  headers?: Record<string, string>;
  /** Pre-registered public client ID or a hosted Client ID Metadata Document URL. */
  clientId?: string;
};

export type McpOAuthAttempt = {
  attemptId: string;
  authorizationUrl: string;
  redirectUrl: string;
};

export class McpAuthorizationError extends Error {
  constructor(
    readonly code:
      | 'configuration'
      | 'unavailable'
      | 'cancelled'
      | 'network'
      | 'reauthorize'
      | 'invalid_response',
  ) {
    super(`MCP authorization: ${code}`);
    this.name = 'McpAuthorizationError';
    this.stack = undefined;
  }
}

/**
 * Native UI capabilities. Ordinary configuration edits use the Data API;
 * consent, credentials, resource reads, and live Apps stay with the MCP owner.
 */
export interface McpModule {
  readResultResource(
    reference: McpResourceReference,
    signal?: AbortSignal,
  ): Promise<McpContentPreview>;
  openApp(input: McpAppLaunch, channel: McpAppChannel, signal: AbortSignal): Promise<McpAppView>;
  receiveAppMessage(id: string, message: string): void;
  updateAppContext(id: string, context: McpAppHostContext): void;
  closeApp(id: string): Promise<void>;
  listContent(serverId: string, signal?: AbortSignal): Promise<McpContentEntry[]>;
  readContent(
    serverId: string,
    entry: McpContentEntry,
    args: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<McpContentPreview>;
  getElicitations(): readonly McpPendingElicitation[];
  subscribeElicitations(listener: () => void): () => void;
  respondElicitation(id: string, response: McpElicitationResponse): void;
  beginOAuth(input: McpOAuthStartInput): Promise<McpOAuthAttempt>;
  completeOAuth(attemptId: string, callbackUrl: string): Promise<McpServer>;
  receiveOAuthCallback(callbackUrl: string): Promise<McpServer | undefined>;
  cancelOAuth(attemptId: string): void;
  disconnectOAuth(serverId: string): Promise<McpServer>;
  getRuntimeSummaries(
    servers: readonly McpServer[],
  ): Promise<Record<string, McpServerRuntimeSummary>>;
  getServerInfo(config: McpConnectionConfig): Promise<McpServerInfo>;
  listTools(serverId: string): Promise<McpToolSummary[]>;
}

export type McpContentEntry = {
  kind: 'resource' | 'template' | 'prompt';
  /** Resource URI, URI template, or prompt name, interpreted only by its server. */
  key: string;
  title: string;
  description?: string;
  arguments: { name: string; description?: string; required: boolean }[];
};
export type McpContentPreview = {
  serverName: string;
  title: string;
  text: string;
  files: { data: string; mimeType: string; name: string }[];
};
