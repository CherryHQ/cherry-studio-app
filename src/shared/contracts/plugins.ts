import * as z from 'zod';

import { type PluginConnection, type PluginId, PluginIdSchema } from '@/shared/data/types/plugin';

export const ConnectPluginSchema = z.strictObject({
  pluginId: PluginIdSchema,
  fields: z.record(z.string().min(1).max(128), z.string().max(16_384)),
});

export type PluginErrorReason =
  | 'unavailable'
  | 'authorization'
  | 'access'
  | 'quota'
  | 'network'
  | 'request'
  | 'unknown-write'
  | 'cancelled'
  | 'storage';

/** Safe diagnostics for tools; UI translates the closed reason instead of the message. */
export class PluginError extends Error {
  constructor(
    public readonly reason: PluginErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'PluginError';
    this.stack = undefined;
  }
}

/** Route-local projection only. Device codes, client secrets and tokens never cross this boundary. */
export type PluginAuthorizationState =
  | { status: 'idle' | 'application-ready' }
  | {
      status: 'waiting';
      attemptId: string;
      stage: 'registration' | 'user';
      verificationUrl: string;
      userCode: string;
      expiresAt: number;
      nextPollAt: number;
    }
  | { status: 'expired' | 'denied' | 'unsupported-account'; attemptId: string }
  | { status: 'ready'; attemptId: string };

export interface PluginsModule {
  connect(
    input: z.infer<typeof ConnectPluginSchema>,
    signal?: AbortSignal,
  ): Promise<PluginConnection>;
  disconnect(pluginId: PluginId): Promise<void>;
  authorization: {
    getState(pluginId: PluginId): Promise<PluginAuthorizationState>;
    begin(pluginId: PluginId): Promise<PluginAuthorizationState>;
    /** Cancelling observation prevents queued polls; it does not discard already issued credentials. */
    poll(
      pluginId: PluginId,
      attemptId: string,
      observationSignal?: AbortSignal,
    ): Promise<PluginAuthorizationState>;
    complete(pluginId: PluginId, attemptId: string): Promise<PluginConnection>;
    cancel(pluginId: PluginId): Promise<PluginAuthorizationState>;
    resetApplication(pluginId: PluginId): Promise<PluginAuthorizationState>;
  };
}
