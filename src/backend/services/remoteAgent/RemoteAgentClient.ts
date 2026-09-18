import { randomUUID } from 'expo-crypto';
import * as z from 'zod';

import type { DesktopRemoteAgent } from '@/shared/data/api/schemas/desktopConnections';

import { createHandshake, MAX_FRAME_BYTES, type SecureChannel } from './secureChannel';

export class RemoteAgentError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
  ) {
    super(code);
    this.name = 'RemoteAgentError';
  }
}
const ReadySchema = z.object({
  type: z.literal('ready'),
  version: z.literal(1),
  instanceId: z.string(),
  publicKey: z.string(),
  nonce: z.string(),
});
const ResponseSchema = z.object({
  type: z.literal('response'),
  requestId: z.string(),
  result: z.unknown().optional(),
  error: z.object({ code: z.string(), retryable: z.boolean().optional() }).optional(),
});
const EventSchema = z.object({
  type: z.literal('event'),
  event: z.string(),
  subscriptionId: z.string(),
  subscriptionEpoch: z.string(),
  eventSeq: z.number().int().positive(),
  sessionId: z.string(),
  data: z.unknown(),
});
export type RemoteAgentEvent = z.infer<typeof EventSchema>;

type Pending = {
  id: string;
  method: string;
  params: unknown;
  control: boolean;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  cleanup(): void;
  timer?: ReturnType<typeof setTimeout>;
};

/** One ordered encrypted socket. Discovery and recovery policy belong to the adapter. */
export class RemoteAgentClient {
  private channel?: SecureChannel;
  private closed = false;
  private authenticated = false;
  private sent = 0;
  private readonly pending = new Map<string, Pending>();
  private readonly queue: Pending[] = [];
  private writer?: ReturnType<typeof setTimeout>;
  private lastSentAt = 0;
  private resolveConnect?: () => void;
  private rejectConnect?: (error: unknown) => void;
  private readonly socket: WebSocket;
  private readonly handshake: ReturnType<typeof createHandshake>;
  private readonly deadline: ReturnType<typeof setTimeout>;
  private transcriptHash?: string;
  private confirmed = false;
  private readonly listeners: (() => void)[] = [];

  constructor(options: {
    url: string;
    descriptor: DesktopRemoteAgent;
    token: string;
    onEvent(event: RemoteAgentEvent): void;
    onClose(error: RemoteAgentError): void;
  }) {
    this.handshake = createHandshake(options.descriptor);
    this.socket = new WebSocket(options.url);
    this.socket.binaryType = 'arraybuffer';
    this.deadline = setTimeout(
      () => this.fail(new RemoteAgentError('CONNECT_TIMEOUT', true)),
      10_000,
    );
    this.onClose = options.onClose;
    const open = () => {
      try {
        this.socket.send(JSON.stringify(this.handshake.hello));
      } catch {
        this.fail(new RemoteAgentError('CONNECTION_LOST', true));
      }
    };
    const lost = () => this.fail(new RemoteAgentError('CONNECTION_LOST', true));
    const message = ({ data }: { data: unknown }) => {
      if (this.closed) return;
      try {
        if (!this.channel) {
          if (typeof data !== 'string' || data.length > 4096) throw new Error('INVALID_READY');
          const ready = ReadySchema.parse(JSON.parse(data));
          const accepted = this.handshake.accept(ready);
          this.channel = accepted.channel;
          this.transcriptHash = accepted.transcriptHash;
          return;
        }
        if (!(data instanceof ArrayBuffer) || data.byteLength > MAX_FRAME_BYTES)
          throw new Error('INVALID_FRAME');
        const value = this.channel.open(new Uint8Array(data));
        if (!this.confirmed) {
          const confirmation = z
            .object({ type: z.literal('confirm'), transcriptHash: z.string() })
            .parse(value);
          if (confirmation.transcriptHash !== this.transcriptHash)
            throw new Error('INVALID_CONFIRM');
          this.confirmed = true;
          this.sendFrame({
            type: 'auth',
            mode: 'device',
            transcriptHash: this.transcriptHash,
            token: options.token,
          });
        } else if (!this.authenticated) {
          z.object({
            type: z.literal('authenticated'),
            deviceId: z.string(),
            expiresAt: z.number(),
          }).parse(value);
          this.authenticated = true;
          clearTimeout(this.deadline);
          this.handshake.dispose();
          this.resolveConnect?.();
        } else if (
          typeof value === 'object' &&
          value !== null &&
          'type' in value &&
          value.type === 'response'
        ) {
          const response = ResponseSchema.parse(value);
          const request = this.pending.get(response.requestId);
          if (!request) return;
          this.pending.delete(request.id);
          request.cleanup();
          if (response.error)
            request.reject(new RemoteAgentError(response.error.code, response.error.retryable));
          else request.resolve(response.result);
          this.schedule();
        } else options.onEvent(EventSchema.parse(value));
      } catch (error) {
        this.fail(
          new RemoteAgentError(
            error instanceof Error && error.message === 'IDENTITY_CHANGED'
              ? 'IDENTITY_CHANGED'
              : 'PROTOCOL_ERROR',
          ),
        );
      }
    };
    this.socket.addEventListener('open', open);
    this.socket.addEventListener('error', lost);
    this.socket.addEventListener('close', lost);
    this.socket.addEventListener('message', message);
    this.listeners.push(() => {
      this.socket.removeEventListener('open', open);
      this.socket.removeEventListener('error', lost);
      this.socket.removeEventListener('close', lost);
      this.socket.removeEventListener('message', message);
    });
  }
  private readonly onClose: (error: RemoteAgentError) => void;
  connected(): Promise<void> {
    if (this.closed) return Promise.reject(new RemoteAgentError('CONNECTION_LOST', true));
    if (this.authenticated) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
    });
  }
  request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    if (this.closed || !this.authenticated)
      return Promise.reject(new RemoteAgentError('CONNECTION_LOST', true));
    if (this.sent >= 8000) {
      this.fail(new RemoteAgentError('CONNECTION_EXPIRED', true));
      return Promise.reject(new RemoteAgentError('CONNECTION_EXPIRED', true));
    }
    if (this.queue.length >= 64) return Promise.reject(new RemoteAgentError('RATE_LIMITED', true));
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const cancel = () => {
        const index = this.queue.indexOf(request);
        if (index >= 0) {
          this.queue.splice(index, 1);
          request.cleanup();
        }
        // Sent reads still occupy a PC request slot until their reply or socket timeout.
        signal?.removeEventListener('abort', cancel);
        reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
        this.schedule();
      };
      const request: Pending = {
        id,
        method,
        params,
        control: method === 'turns.cancel' || method === 'interactions.respond',
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(request.timer);
          signal?.removeEventListener('abort', cancel);
        },
      };
      if (signal?.aborted) {
        cancel();
        return;
      }
      signal?.addEventListener('abort', cancel, { once: true });
      this.queue.push(request);
      this.schedule();
    });
  }
  private nextIndex() {
    const pending = [...this.pending.values()];
    if (pending.filter((request) => request.control).length < 2) {
      const control = this.queue.findIndex((request) => request.control);
      if (control >= 0) return control;
    }
    return pending.filter((request) => !request.control).length < 6
      ? this.queue.findIndex((request) => !request.control)
      : -1;
  }
  private schedule() {
    if (this.writer || this.closed || this.nextIndex() < 0) return;
    this.writer = setTimeout(
      () => {
        this.writer = undefined;
        const index = this.nextIndex();
        if (index < 0) return;
        const request = this.queue.splice(index, 1)[0];
        if (!request || this.closed) return;
        this.pending.set(request.id, request);
        request.timer = setTimeout(
          () => this.fail(new RemoteAgentError('REQUEST_TIMEOUT', true)),
          30_000,
        );
        try {
          this.sendFrame({
            type: 'request',
            requestId: request.id,
            method: request.method,
            params: request.params,
          });
          this.sent++;
          this.lastSentAt = performance.now();
        } catch {
          this.fail(new RemoteAgentError('CONNECTION_LOST', true));
        }
        this.schedule();
      },
      Math.max(0, 510 - (performance.now() - this.lastSentAt)),
    );
  }
  private sendFrame(value: unknown) {
    if (!this.channel || this.socket.readyState !== WebSocket.OPEN)
      throw new Error('CONNECTION_LOST');
    this.socket.send(this.channel.seal(value));
  }
  private fail(error: RemoteAgentError) {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.deadline);
    clearTimeout(this.writer);
    this.handshake.dispose();
    this.channel?.dispose();
    for (const dispose of this.listeners) dispose();
    this.socket.close();
    this.rejectConnect?.(error);
    for (const request of [...this.queue, ...this.pending.values()]) {
      request.cleanup();
      request.reject(error);
    }
    this.queue.length = 0;
    this.pending.clear();
    this.onClose(error);
  }
  dispose() {
    this.fail(new RemoteAgentError('CLOSED'));
  }
}
