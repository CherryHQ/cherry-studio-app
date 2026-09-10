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
  | 'storage'
  | 'requires-disconnect';

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
  | {
      status: 'callback';
      attemptId: string;
      stage: string;
      authorizationUrl: string;
      redirectUrl: string;
      expiresAt: number;
    }
  | {
      status: 'review';
      attemptId: string;
      accountLabel: string;
      requiresDisconnect: boolean;
    }
  | { status: 'expired' | 'denied' | 'unsupported-account'; attemptId: string }
  | { status: 'ready'; attemptId: string };

/** What an observing screen renders: current authorization state and backend progress. */
export type PluginAuthorizationObservation = {
  state: PluginAuthorizationState;
  /** True while the backend is reading, polling or completing. */
  busy: boolean;
  /** Last failure since the previous successful step; cleared when a new step starts. */
  error?: PluginErrorReason;
  /** Set once the grant is committed as a connection. */
  connection?: PluginConnection;
};

export type PluginDisconnectResult = {
  revocation: 'revoked' | 'unconfirmed' | 'not-applicable';
  managementUrl?: string;
};

export interface PluginsModule {
  connect(
    input: z.infer<typeof ConnectPluginSchema>,
    signal?: AbortSignal,
  ): Promise<PluginConnection>;
  disconnect(pluginId: PluginId): Promise<PluginDisconnectResult>;
  observeConnections(listener: () => void): () => void;
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
    receiveCallback(
      pluginId: PluginId,
      authMethod: string,
      attemptId: string,
      url: string,
    ): Promise<PluginAuthorizationState>;
    /** Thin route fallback; resolves the active callback attempt before dispatching. */
    receiveRedirect(pluginId: PluginId, url: string): Promise<void>;
    confirm(
      pluginId: PluginId,
      authMethod: string,
      attemptId: string,
    ): Promise<PluginAuthorizationState>;
    /** Authorize with an existing application instead of registering a new one. */
    useApplication(
      pluginId: PluginId,
      authMethod: string,
      fields: Record<string, string>,
    ): Promise<PluginAuthorizationState>;
    cancel(
      pluginId: PluginId,
      authMethod: string,
      callbackAttemptId?: string,
    ): Promise<PluginAuthorizationState>;
    resetApplication(pluginId: PluginId, authMethod: string): Promise<PluginAuthorizationState>;
  };
}
