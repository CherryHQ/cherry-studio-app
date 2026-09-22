import {
  connectionMethods,
  pairingMethods,
  remoteAuthorizationSchema,
  remoteFailureSchema,
  remoteLimits,
  type RemoteAuthorization,
} from '@cherrystudio/remote-protocol';
import { configurationMethods } from '@cherrystudio/remote-protocol/configuration';
import type { SecureChannel } from '@cherrystudio/remote-transport';
import { loggerService } from '@logger';
import { JSONRPCClient, JSONRPCErrorException } from 'json-rpc-2.0';
import type * as z from 'zod';

import { DesktopUnreachableError, RemoteFailureError } from './remoteErrors';
import { openWebSocketStream, remoteUrl } from './remoteSocket';
import { transportLogger } from './transportLogger';

export { DesktopUnreachableError, RemoteFailureError } from './remoteErrors';

const logger = loggerService.withContext('DesktopSession');
const PROTOCOL_VERSIONS = [1];
const REFRESH_MARGIN_MS = 60_000;

export const desktopMethods = {
  ...connectionMethods(remoteAuthorizationSchema),
  ...pairingMethods(remoteAuthorizationSchema),
  ...configurationMethods,
};
export type DesktopMethod = keyof typeof desktopMethods;
export type DesktopParams<M extends DesktopMethod> = z.input<(typeof desktopMethods)[M]['params']>;
export type DesktopResult<M extends DesktopMethod> = z.output<(typeof desktopMethods)[M]['result']>;
export type DesktopNotification = { method: string; params?: unknown };

export type DialChannel = (url: string, signal: AbortSignal) => Promise<SecureChannel>;

export interface DesktopSessionOptions {
  addresses: string[];
  port: number;
  desktopIdentity: string;
  identity: Uint8Array;
  signal: AbortSignal;
  /** Test seam; production dials the desktop's WebSocket upgrade. */
  dial?: DialChannel;
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

async function dialWebSocket(
  identity: Uint8Array,
  desktopIdentity: string,
  url: string,
  signal: AbortSignal,
): Promise<SecureChannel> {
  const { connectSecureChannel } = await import('@cherrystudio/remote-transport');
  const stream = await openWebSocketStream(url, signal);
  return connectSecureChannel(stream, {
    identity,
    logger: transportLogger,
    protocolVersions: PROTOCOL_VERSIONS,
    remoteIdentity: desktopIdentity,
    signal,
  });
}

/** One encrypted JSON-RPC connection to a desktop: request/response, notifications, heartbeat, token refresh. */
export class DesktopSession {
  static async connect(options: DesktopSessionOptions): Promise<DesktopSession> {
    const dial: DialChannel =
      options.dial ??
      ((url, signal) => dialWebSocket(options.identity, options.desktopIdentity, url, signal));
    const failures: string[] = [];
    for (const address of options.addresses) {
      options.signal.throwIfAborted();
      let channel: SecureChannel | undefined;
      try {
        channel = await dial(remoteUrl(address, options.port), options.signal);
        const session = new DesktopSession(channel, address);
        await session.request(
          'connection.hello',
          { protocolVersions: PROTOCOL_VERSIONS },
          options.signal,
        );
        return session;
      } catch (error) {
        options.signal.throwIfAborted();
        channel?.abort(error instanceof Error ? error : new Error('Handshake failed'));
        if (error instanceof RemoteFailureError) throw error;
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        logger.warn('Desktop address failed', { address, channel: Boolean(channel), message });
        failures.push(`${address}: ${message}`);
      }
    }
    throw new DesktopUnreachableError(failures);
  }

  private readonly client: JSONRPCClient;
  private readonly listeners = new Set<(notification: DesktopNotification) => void>();
  private authorization: RemoteAuthorization | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private closed = false;
  readonly done: Promise<void>;

  constructor(
    private readonly channel: SecureChannel,
    readonly address: string,
  ) {
    this.client = new JSONRPCClient((request) => this.channel.write(request));
    this.heartbeat = setInterval(() => {
      void this.request('connection.ping', { nonce: String(Date.now()) }).catch(() => undefined);
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
    const schema = desktopMethods[method];
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

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    clearTimeout(this.refreshTimer);
    void this.channel.close().catch(() => undefined);
  }

  private adopt(authorization: RemoteAuthorization, expiresAt: string): void {
    this.authorization = authorization;
    clearTimeout(this.refreshTimer);
    const delay = Math.max(1_000, Date.parse(expiresAt) - Date.now() - REFRESH_MARGIN_MS);
    this.refreshTimer = setTimeout(() => {
      void this.request('connection.refresh', {})
        .then((result) => this.adopt(result.authorization, result.expiresAt))
        .catch(() => undefined);
    }, delay);
  }

  private async pump(): Promise<void> {
    try {
      while (!this.closed) {
        const message = await this.channel.read();
        if (isNotification(message)) {
          for (const listener of this.listeners) listener(message);
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
    }
  }
}
