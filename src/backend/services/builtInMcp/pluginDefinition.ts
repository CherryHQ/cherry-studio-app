import type { MCPClient } from '@ai-sdk/mcp';

import type { PluginCatalogEntry } from '@/shared/data/types/plugin';

export type PluginToolPolicy = Readonly<Record<string, 'read' | 'write'>>;

export type PluginClientContext = {
  readonly pluginId: string;
  readonly tools: PluginToolPolicy;
  readonly getCredential: () => Promise<string>;
  readonly signal: AbortSignal;
  readonly getUserToken?: (credential: string, signal?: AbortSignal) => Promise<string>;
};

/** A bundled plugin owns its metadata, credential format, client and read-only setup check. */
export interface PluginDefinition {
  readonly catalog: PluginCatalogEntry;
  /** Optional saved server name, independent of the UI's active language. */
  readonly serverName?: string;
  readonly authMethod: string;
  readonly additionalAuthMethods?: readonly string[];
  readonly tools: PluginToolPolicy;
  encodeCredentials(fields: Record<string, string>): string;
  createClient(context: PluginClientContext): Promise<MCPClient>;
  readonly validation: {
    readonly tool: string;
    /** Omit to validate discovery only. Never use a write tool for setup. */
    readonly args?: Record<string, unknown>;
    accountLabel(output: unknown, credential: string): string;
  };
}
