import * as z from 'zod';

import { type PluginConnection, type PluginId, PluginIdSchema } from '@/shared/data/types/plugin';

export const ConnectPluginSchema = z.strictObject({
  pluginId: PluginIdSchema,
  authMethod: PluginIdSchema,
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
  | { status: 'idle' }
  | { status: 'application-ready'; applicationId: string }
  | {
      status: 'waiting';
      attemptId: string;
      stage: string;
      verificationUrl: string;
      userCode?: string;
      expiresAt: number;
      nextPollAt: number;
    }
  | { status: 'expired' | 'denied' | 'unsupported-account'; attemptId: string }
  | { status: 'ready'; attemptId: string };

/** What an observing screen renders: the durable state plus the backend's transient progress. */
export type PluginAuthorizationObservation = {
  state: PluginAuthorizationState;
  /** True while the backend is reading, polling or completing. */
  busy: boolean;
  /** Last failure since the previous successful step; cleared when a new step starts. */
  error?: PluginErrorReason;
  /** Set once the grant is committed as a connection. */
  connection?: PluginConnection;
};

export interface PluginsModule {
  connect(
    input: z.infer<typeof ConnectPluginSchema>,
    signal?: AbortSignal,
  ): Promise<PluginConnection>;
  disconnect(pluginId: PluginId): Promise<void>;
  authorization: {
    /**
     * The backend polls and completes only while at least one observer is attached. Detaching
     * stops scheduling; it does not discard issued credentials or cancel the attempt.
     */
    observe(
      pluginId: PluginId,
      authMethod: string,
      listener: (observation: PluginAuthorizationObservation) => void,
    ): () => void;
    /** Run one step now, for example after the user returns from the browser. */
    check(pluginId: PluginId, authMethod: string): void;
    begin(pluginId: PluginId, authMethod: string): Promise<PluginAuthorizationState>;
    /** Authorize with an existing application instead of registering a new one. */
    useApplication(
      pluginId: PluginId,
      authMethod: string,
      fields: Record<string, string>,
    ): Promise<PluginAuthorizationState>;
    cancel(pluginId: PluginId, authMethod: string): Promise<PluginAuthorizationState>;
    resetApplication(pluginId: PluginId, authMethod: string): Promise<PluginAuthorizationState>;
  };
}
