import type { MCPClient } from '@ai-sdk/mcp';

import type { PluginAuthorizationState } from '@/shared/contracts/plugins';
import type {
  PluginCatalogEntry,
  PluginConnection,
  PluginCredential,
  PluginCredentialMethod,
  PluginInteractiveMethod,
} from '@/shared/data/types/plugin';

/** Logical credentials stay inside the backend; SQLite owns only their references. */
export type PluginGrant = { id: string; credential: PluginCredential };

export interface PluginAuthorizationStore {
  readApplication(): Promise<PluginCredential | undefined>;
  writeApplication(application: PluginCredential | undefined): Promise<void>;
  getGrant(authorizationId?: string): Promise<PluginGrant | undefined>;
  updateCredential(
    authorizationId: string,
    credential: PluginCredential,
    signal: AbortSignal,
  ): Promise<boolean>;
  commit(
    credential: PluginCredential,
    accountLabel: string,
    signal: AbortSignal,
  ): Promise<PluginConnection>;
}

export type PluginToolPolicy = Readonly<Record<string, 'read' | 'write'>>;

export type PluginRequestAuthorization = {
  apply(
    credential: PluginCredential,
    request: { url: URL; headers: Headers; signal?: AbortSignal },
  ): void | Promise<void>;
  invalidate?(): void;
};

export type PluginClientContext = {
  readonly pluginId: string;
  readonly tools: PluginToolPolicy;
  readonly getCredential: (signal?: AbortSignal) => Promise<PluginCredential>;
  readonly assertAuthorized: () => Promise<void>;
  readonly authorization: PluginRequestAuthorization;
  readonly signal: AbortSignal;
};

/** One app-owned executor per plugin/method; callers own their waits, never shared renewal. */
export interface PluginAuthorizationRuntime {
  readonly attemptSignal: AbortSignal;
  getState(): Promise<PluginAuthorizationState>;
  begin(): Promise<PluginAuthorizationState>;
  poll(attemptId: string): Promise<PluginAuthorizationState>;
  useApplication?(fields: Record<string, string>): Promise<PluginAuthorizationState>;
  resetApplication?(): Promise<PluginAuthorizationState>;
  prepare(
    attemptId: string,
    signal: AbortSignal,
  ): Promise<{
    credential: PluginCredential;
    accountLabel: string;
    signal: AbortSignal;
  }>;
  commit(attemptId: string, accountLabel: string, signal: AbortSignal): Promise<PluginConnection>;
  resolveCredential(grant: PluginGrant, signal?: AbortSignal): Promise<PluginCredential>;
  cancel(): Promise<PluginAuthorizationState>;
  interrupt(): void;
  invalidateGrant(): void;
  stop(): Promise<void>;
}

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
    accountLabel(output: unknown, credential: PluginCredential): string;
  };
}
