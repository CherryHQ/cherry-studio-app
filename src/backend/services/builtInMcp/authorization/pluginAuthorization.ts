import type { PluginAuthorizationState } from '@/shared/contracts/plugins';
import type { PluginConnection } from '@/shared/data/types/plugin';

import type { PluginCredential, PluginGrant } from './pluginCredential';

/** Method-scoped access to resolved grants and reusable application secrets. */
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

/**
 * One app-owned browser-confirmation flow, polled by its observer. Callers own their
 * waits, never shared renewal. Application reuse/reset is an optional method capability;
 * callback and native SDK flows are not represented by this contract.
 */
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
  resolveCredential(authorizationId: string, signal?: AbortSignal): Promise<PluginCredential>;
  cancel(): Promise<PluginAuthorizationState>;
  interrupt(): void;
  invalidateGrant(): void;
  stop(): Promise<void>;
}
