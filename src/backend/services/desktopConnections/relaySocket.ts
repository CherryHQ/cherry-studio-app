import type { RelayWebSocket } from '@cherrystudio/relay-client';
import { requireOptionalNativeModule } from 'expo';
import { randomUUID } from 'expo-crypto';
import { fromByteArray, toByteArray } from 'react-native-quick-base64';

type SocketEvent = {
  id: string;
  type: 'open' | 'message' | 'error' | 'close';
  data?: string;
  binary?: boolean;
};
interface NativeRelaySocket {
  addListener(name: 'socket', listener: (event: SocketEvent) => void): { remove(): void };
  connect(id: string, url: string): void;
  /** Resolves after the native send drains, not merely after enqueueing it. */
  send(id: string, data: string, binary: boolean): Promise<void>;
  received(id: string): void;
  close(id: string): void;
}

const MAX_MESSAGE_BYTES = 65_560;
const MAX_QUEUED_BYTES = 1024 * 1024;
const MAX_QUEUED_MESSAGES = 1024;
type Listener = (event: { data: unknown }) => void;

/** Owns the JS queue and includes the one native in-flight write in bufferedAmount. */
export class NativeRelayWebSocket implements RelayWebSocket {
  binaryType = 'arraybuffer';
  readyState = 0;
  bufferedAmount = 0;
  private readonly id = randomUUID();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly queue: { data: string | Uint8Array<ArrayBuffer>; bytes: number }[] = [];
  private subscription: { remove(): void };
  private flushing = false;

  constructor(
    private readonly native: NativeRelaySocket,
    url: string,
  ) {
    this.subscription = native.addListener('socket', (event) => {
      if (event.id !== this.id || this.readyState === 3) return;
      if (event.type === 'open') {
        this.readyState = 1;
        this.emit('open');
      } else if (event.type === 'message') {
        try {
          if (this.readyState !== 1 || typeof event.data !== 'string')
            throw new Error('Invalid Relay message');
          if (
            event.data.length >
            (event.binary ? Math.ceil(MAX_MESSAGE_BYTES / 3) * 4 : MAX_MESSAGE_BYTES)
          )
            throw new Error('Oversized Relay message');
          const data = event.binary ? toByteArray(event.data) : event.data;
          const bytes =
            typeof data === 'string' ? new TextEncoder().encode(data).byteLength : data.byteLength;
          if (bytes > MAX_MESSAGE_BYTES) throw new Error('Oversized Relay message');
          this.emit('message', data);
        } catch {
          this.fail();
        } finally {
          if (this.readyState === 1) native.received(this.id);
        }
      } else if (event.type === 'error') this.fail();
      else this.close();
    });
    // Keep factory events asynchronous so rendezvous installs every handler before admission.
    queueMicrotask(() => {
      if (this.readyState !== 0) return;
      try {
        native.connect(this.id, url);
      } catch {
        this.fail();
      }
    });
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }
  private emit(type: string, data?: unknown): void {
    // A DATA handler added while handling ready must not receive that same ready control.
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ data });
  }
  send(data: string | Uint8Array<ArrayBuffer>): void {
    if (this.readyState !== 1) throw new Error('Relay socket is not open');
    const bytes =
      typeof data === 'string' ? new TextEncoder().encode(data).byteLength : data.byteLength;
    if (
      bytes > MAX_MESSAGE_BYTES ||
      this.bufferedAmount + bytes > MAX_QUEUED_BYTES ||
      this.queue.length >= MAX_QUEUED_MESSAGES
    ) {
      this.close();
      throw new Error('Relay socket queue limit exceeded');
    }
    this.queue.push({ data: typeof data === 'string' ? data : data.slice(), bytes });
    this.bufferedAmount += bytes;
    void this.flush();
  }
  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.readyState === 1 && this.queue.length) {
        const item = this.queue[0];
        await this.native.send(
          this.id,
          typeof item.data === 'string' ? item.data : fromByteArray(item.data),
          typeof item.data !== 'string',
        );
        if (this.readyState !== 1) return;
        this.bufferedAmount -= item.bytes;
        this.queue.shift();
      }
    } catch {
      this.fail();
    } finally {
      this.flushing = false;
    }
  }
  private fail(): void {
    if (this.readyState === 3) return;
    try {
      this.emit('error');
    } finally {
      this.close();
    }
  }
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.queue.length = 0;
    this.bufferedAmount = 0;
    this.subscription.remove();
    try {
      this.native.close(this.id);
    } finally {
      this.emit('close');
      this.listeners.clear();
    }
  }
}

export function createRelaySocket(url: string): RelayWebSocket {
  const native = requireOptionalNativeModule<NativeRelaySocket>('RelaySocket');
  if (!native) throw new Error('Relay requires a development or release build with RelaySocket');
  return new NativeRelayWebSocket(native, url);
}
