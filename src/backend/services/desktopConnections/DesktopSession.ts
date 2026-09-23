import {
  connectionMethods,
  pairingMethods,
  remoteAuthorizationSchema,
  remoteFailureSchema,
  remoteLimits,
  type RemoteAuthorization,
} from '@cherrystudio/remote-protocol';
import { agentMethods } from '@cherrystudio/remote-protocol/agent';
import { configurationMethods } from '@cherrystudio/remote-protocol/configuration';
import type { SecureChannel } from '@cherrystudio/remote-transport';
import type { MessageStream } from '@libp2p/interface';
import { JSONRPCClient, JSONRPCErrorException } from 'json-rpc-2.0';
import type * as z from 'zod';

import { DesktopUnreachableError, RemoteFailureError } from './remoteErrors';
import { transportLogger } from './transportLogger';

export { DesktopUnreachableError, RemoteFailureError } from './remoteErrors';

const PROTOCOL_VERSIONS = [1];
const REFRESH_MARGIN_MS = 60_000;

export const desktopMethods = {
  ...connectionMethods(remoteAuthorizationSchema),
  ...pairingMethods(remoteAuthorizationSchema),
  ...configurationMethods,
  ...agentMethods,
};
export type DesktopMethod = keyof typeof desktopMethods;
export type DesktopParams<M extends DesktopMethod> = z.input<(typeof desktopMethods)[M]['params']>;
export type DesktopResult<M extends DesktopMethod> = z.output<(typeof desktopMethods)[M]['result']>;
export type DesktopNotification = { method: string; params?: unknown };

export interface DesktopSessionOptions {
  stream: MessageStream;
  secure?: typeof import('@cherrystudio/remote-transport').connectSecureChannel;
  address: string;
  desktopIdentity: string;
  identity: Uint8Array;
  signal: AbortSignal;
}

function isNotification(value: unknown): value is DesktopNotification {
  return (
    typeof value === 'object' &&
    value !== null &&
    'method' in value &&
    !('id' in value) &&
    typeof value.method === 'string'
  );
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** One pinned encrypted stream; address selection belongs to the connection manager. */
export class DesktopSession {
  agentFailureVersion?: number;
  static async connect(options: DesktopSessionOptions): Promise<DesktopSession> {
    let session: DesktopSession | undefined;
    try {
      const connectSecureChannel =
        options.secure ?? (await import('@cherrystudio/remote-transport')).connectSecureChannel;
      const channel = await connectSecureChannel(options.stream, {
        identity: options.identity,
        remoteIdentity: options.desktopIdentity,
        logger: transportLogger,
        protocolVersions: PROTOCOL_VERSIONS,
        signal: options.signal,
      });
      session = new DesktopSession(channel, options.address);
      const hello = await session.request(
        'connection.hello',
        { protocolVersions: PROTOCOL_VERSIONS },
        options.signal,
      );
      session.agentFailureVersion = hello.agentFailureVersion;
      options.signal.throwIfAborted();
      return session;
    } catch (error) {
      session?.close();
      options.stream.abort(error instanceof Error ? error : new Error('Handshake failed'));
      throw error;
    }
  }

  private readonly client: JSONRPCClient;
  private readonly listeners = new Set<(notification: DesktopNotification) => void>();
  private authorization: RemoteAuthorization | undefined;
  private readonly authorizationListeners = new Set<(authorization: RemoteAuthorization) => void>();
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private closed = false;
  private inFlight = 0;
  readonly done: Promise<void>;

  constructor(
    private readonly channel: SecureChannel,
    readonly address: string,
  ) {
    this.client = new JSONRPCClient((request) => this.channel.write(request));
    this.heartbeat = setInterval(() => {
      void this.request('connection.ping', { nonce: String(Date.now()) }).catch(() => this.close());
    }, remoteLimits.heartbeatMs);
    this.done = this.pump();
  }

  get currentAuthorization(): RemoteAuthorization | undefined {
    return this.authorization;
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  async request<M extends DesktopMethod>(
    method: M,
    params: DesktopParams<M>,
    signal?: AbortSignal,
  ): Promise<DesktopResult<M>> {
    if (this.closed) throw new DesktopUnreachableError(['connection closed']);
    signal?.throwIfAborted();
    if (method.startsWith('agent.') && this.agentFailureVersion !== 1)
      throw new RemoteFailureError({
        reason: 'UPGRADE_REQUIRED',
        message: 'Desktop Agent failure contract is not supported',
      });
    if (this.inFlight >= remoteLimits.inFlightRequests)
      throw new RemoteFailureError({ reason: 'RESOURCE_EXHAUSTED', message: 'Too many requests' });
    const schema = desktopMethods[method];
    this.inFlight++;
    try {
      const result = await withAbort(
        Promise.resolve(
          this.client.timeout(remoteLimits.idleMs).request(method, schema.params.parse(params)),
        ),
        signal,
      );
      return schema.result.parse(result) as DesktopResult<M>;
    } catch (error) {
      if (error instanceof JSONRPCErrorException) {
        const failure = remoteFailureSchema.safeParse(error.data);
        throw new RemoteFailureError(
          failure.success ? failure.data : { reason: 'INTERNAL', message: error.message },
        );
      }
      throw error;
    } finally {
      this.inFlight--;
    }
  }

  /** Identity is the Noise key, so no stored token is needed; the desktop's current grants come back. */
  async authenticate(deviceId: string, signal?: AbortSignal): Promise<RemoteAuthorization> {
    const result = await this.request('connection.authenticate', { deviceId }, signal);
    this.adopt(result.authorization, result.expiresAt);
    return result.authorization;
  }

  onNotification(listener: (notification: DesktopNotification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onAuthorization(listener: (authorization: RemoteAuthorization) => void): () => void {
    this.authorizationListeners.add(listener);
    return () => this.authorizationListeners.delete(listener);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.client.rejectAllPendingRequests('Connection closed');
    clearInterval(this.heartbeat);
    clearTimeout(this.refreshTimer);
    void this.channel.close().catch(() => undefined);
  }

  private adopt(authorization: RemoteAuthorization, expiresAt: string): void {
    this.authorization = authorization;
    for (const listener of this.authorizationListeners) listener(authorization);
    clearTimeout(this.refreshTimer);
    const delay = Math.max(1_000, Date.parse(expiresAt) - Date.now() - REFRESH_MARGIN_MS);
    this.refreshTimer = setTimeout(() => {
      void this.request('connection.refresh', {})
        .then((result) => this.adopt(result.authorization, result.expiresAt))
        .catch(() => this.close());
    }, delay);
  }

  private async pump(): Promise<void> {
    try {
      while (!this.closed) {
        const message = await this.channel.read();
        if (isNotification(message)) {
          for (const listener of this.listeners) listener(message);
          if (message.method === 'connection.closed') this.close();
        } else {
          this.client.receive(message as never);
        }
      }
    } catch {
      // The channel is gone; pending callers learn it below.
    } finally {
      this.close();
      this.client.rejectAllPendingRequests('Connection closed');
      this.listeners.clear();
      this.authorizationListeners.clear();
    }
  }
}
