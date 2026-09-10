import type { PluginAuthorizationState } from '@/shared/contracts/plugins';
import type { PluginConnectionStatus, PluginConnection } from '@/shared/data/types/plugin';

import type { PluginCredential, PluginGrant } from './pluginCredential';

/** Method-scoped access to resolved grants and reusable application secrets. */
export interface PluginAuthorizationStore {
  notifyChanged(): void;
  getCurrentAuthorizationId(): Promise<string | undefined>;
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
    expected?: { authorizationId: string | undefined },
  ): Promise<PluginConnection>;
}

/**
 * One method owns attempts and shared renewal. The observer drives declared capabilities.
 * Callers own their waits; grant replacement and host lifetime own renewal cancellation.
 */
export interface PluginAuthorizationRuntime {
  readonly attemptSignal: AbortSignal;
  getState(): Promise<PluginAuthorizationState>;
  begin(): Promise<PluginAuthorizationState>;
  poll?(attemptId: string): Promise<PluginAuthorizationState>;
  receiveCallback?(attemptId: string, url: string): Promise<PluginAuthorizationState>;
  confirm?(attemptId: string): Promise<PluginAuthorizationState>;
  describeConnection?(authorizationId: string): Promise<PluginConnectionStatus>;
  rejectCredential?(authorizationId: string, credential: PluginCredential): Promise<void>;
  prepareRevocation?(
    authorizationId: string,
  ): Promise<{ managementUrl: string; revoke(signal: AbortSignal): Promise<void> }>;
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
  cancel(callbackAttemptId?: string): Promise<PluginAuthorizationState>;
  interrupt(): void;
  invalidateGrant(): void;
  stop(): Promise<void>;
}
