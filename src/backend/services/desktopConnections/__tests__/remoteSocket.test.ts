import { openWebSocket } from '../remoteSocket';

class TestSocket {
  static latest: TestSocket;
  binaryType = 'blob';
  closed = false;
  listeners = new Map<string, Set<(event: unknown) => void>>();
  constructor() {
    TestSocket.latest = this;
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string, event = {}) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
  close() {
    this.closed = true;
  }
}

const address = 'wss://desktop.example.com:443/v1/remote/connect';
const originalSocket = global.WebSocket;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  global.WebSocket = TestSocket as unknown as typeof WebSocket;
});
afterEach(() => {
  global.WebSocket = originalSocket;
  jest.useRealTimers();
});

it('preserves the native close reason sent immediately after an error event', async () => {
  const result = openWebSocket(address, new AbortController().signal).catch(
    (error: unknown) => error,
  );
  await jest.advanceTimersByTimeAsync(0);
  TestSocket.latest.emit('error');
  TestSocket.latest.emit('close', {
    code: 1006,
    reason: "Expected HTTP 101 response but was '404 Not Found'",
  });
  expect(await result).toMatchObject({
    failure: {
      address,
      kind: 'websocket',
      closeCode: 1006,
      message: "Expected HTTP 101 response but was '404 Not Found'",
    },
  });
  expect(TestSocket.latest.closed).toBe(true);
  expect([...TestSocket.latest.listeners.values()].every((listeners) => listeners.size === 0)).toBe(
    true,
  );
  expect(jest.getTimerCount()).toBe(0);
});

it('reports opaque error events without inventing a rejection status', async () => {
  const result = openWebSocket(address, new AbortController().signal).catch(
    (error: unknown) => error,
  );
  await jest.advanceTimersByTimeAsync(0);
  TestSocket.latest.emit('error');
  expect(await result).toMatchObject({ failure: { address, kind: 'websocket' } });
  expect(await result).not.toHaveProperty('failure.message');
});

it('times out a silent server and releases the socket', async () => {
  const result = openWebSocket(address, new AbortController().signal).catch(
    (error: unknown) => error,
  );
  await jest.advanceTimersByTimeAsync(4000);
  expect(await result).toMatchObject({ failure: { address, kind: 'timeout' } });
  expect(TestSocket.latest.closed).toBe(true);
});

it('preserves cancellation instead of reporting a connection failure', async () => {
  const controller = new AbortController();
  const result = openWebSocket(address, controller.signal).catch((error: unknown) => error);
  await jest.advanceTimersByTimeAsync(0);
  controller.abort();
  expect(await result).toMatchObject({ name: 'AbortError' });
  expect(TestSocket.latest.closed).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

it('hands an opened binary socket to the transport without leaving an opening timeout', async () => {
  const result = openWebSocket(address, new AbortController().signal);
  await jest.advanceTimersByTimeAsync(0);
  TestSocket.latest.emit('open');
  await expect(result).resolves.toHaveProperty('binaryType', 'arraybuffer');
  expect(TestSocket.latest.closed).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
});

it('rejects an already cancelled attempt before creating a socket', async () => {
  const controller = new AbortController();
  controller.abort();
  const previous = TestSocket.latest;
  await expect(openWebSocket(address, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(TestSocket.latest).toBe(previous);
});

it('bounds native messages and ignores invalid close codes', async () => {
  const result = openWebSocket(address, new AbortController().signal).catch(
    (error: unknown) => error,
  );
  TestSocket.latest.emit('close', { code: 0, reason: 'a'.repeat(500) });
  expect(await result).toMatchObject({
    failure: { message: 'a'.repeat(400), closeCode: undefined },
  });
});
