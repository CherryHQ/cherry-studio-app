import type { MCPClient } from '@ai-sdk/mcp';

import type {
  PluginCatalogEntry,
  PluginCredentialMethod,
  PluginInteractiveMethod,
} from '@/shared/data/types/plugin';

import type {
  PluginAuthorizationRuntime,
  PluginAuthorizationStore,
} from './authorization/pluginAuthorization';
import type { PluginCredential } from './authorization/pluginCredential';

export type PluginToolPolicy = Readonly<Record<string, 'read' | 'write'>>;

export type PluginRequestAuthorization = {
  apply(
    credential: PluginCredential,
    request: { url: URL; headers: Headers; signal?: AbortSignal },
  ): void | Promise<void>;
};

export type PluginClientContext = {
  readonly pluginId: string;
  readonly tools: PluginToolPolicy;
  readonly getCredential: (signal?: AbortSignal) => Promise<PluginCredential>;
  readonly assertAuthorized: () => Promise<void>;
  readonly authorization: PluginRequestAuthorization;
  readonly signal: AbortSignal;
};

export type PluginAuthorizationDefinition = (
  | (PluginCredentialMethod & {
      encodeCredentials(fields: Record<string, string>): PluginCredential;
    })
  | (PluginInteractiveMethod & {
      createRuntime(store: PluginAuthorizationStore): PluginAuthorizationRuntime;
    })
) & {
  createRequestAuthorization(tools: PluginToolPolicy): PluginRequestAuthorization;
};

/** A bundled plugin owns its methods, credential formats, client and read-only setup check. */
export interface PluginDefinition {
  readonly catalog: Omit<PluginCatalogEntry, 'authMethods'>;
  /** Saved MCP server name, independent of the UI's active language. */
  readonly serverName: string;
  readonly authMethods: readonly PluginAuthorizationDefinition[];
  readonly tools: PluginToolPolicy;
  createClient(context: PluginClientContext): Promise<MCPClient>;
  readonly validation: {
    readonly tool: string;
    /** Omit to validate discovery only. Never use a write tool for setup. */
    readonly args?: Record<string, unknown>;
    accountLabel(output: unknown): string;
  };
}
