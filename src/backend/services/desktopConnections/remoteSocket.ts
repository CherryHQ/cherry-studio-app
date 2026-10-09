import type { RemoteSocket } from '@cherrystudio/remote-transport';
import type { MessageStream } from '@libp2p/interface';

import { transportLogger } from './transportLogger';

const OPEN_TIMEOUT_MS = 4_000;

/** React Native's WebSocket lacks `bufferedAmount`; the transport treats 0 as never congested. */
function adapt(socket: WebSocket): RemoteSocket {
  return {
    get binaryType() {
      return socket.binaryType;
    },
    set binaryType(value: string) {
      socket.binaryType = value as BinaryType;
    },
    get bufferedAmount() {
      return socket.bufferedAmount ?? 0;
    },
    get readyState() {
      return socket.readyState;
    },
    send: (data) => socket.send(data),
    close: (code, reason) => socket.close(code, reason),
    addEventListener: (type: string, listener: (event: never) => void) =>
      socket.addEventListener(type as 'message', listener as never),
    removeEventListener: (type: string, listener: (event: never) => void) =>
      socket.removeEventListener(type as 'message', listener as never),
  };
}

/** Opens the desktop's WebSocket upgrade and hands the raw byte stream to the Noise transport. */
export async function openWebSocketStream(
  url: string,
  signal: AbortSignal,
): Promise<MessageStream> {
  const { RemoteSocketStream } = await import('@cherrystudio/remote-transport');
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const socket = new WebSocket(url);
    let settled = false;
    socket.binaryType = 'arraybuffer';
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      socket.removeEventListener('open', opened);
      socket.removeEventListener('error', failed);
      socket.removeEventListener('close', failed);
      if (error) {
        socket.close();
        reject(error);
      } else {
        resolve(
          new RemoteSocketStream(adapt(socket), transportLogger.forComponent('remote'), 'outbound'),
        );
      }
    };
    const opened = () => finish();
    const failed = () => finish(new Error(`Could not open ${url}`));
    const abort = () => finish(new Error('Connection cancelled'));
    const timer = setTimeout(() => finish(new Error(`Timed out opening ${url}`)), OPEN_TIMEOUT_MS);
    socket.addEventListener('open', opened);
    socket.addEventListener('error', failed);
    socket.addEventListener('close', failed);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
