import type { DesktopDomainLease } from '@/backend/services/desktopConnections';

import { RemoteAgentRuntime } from '../RemoteAgentRuntime';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const mockScopes: ReturnType<typeof mockScope>[] = [];
function mockScope(lease: DesktopDomainLease) {
  let status = 'ready';
  let pending = false;
  const operations = new Set<() => void>();
  const drain = deferred<void>();
  const unsubscribe = jest.fn();
  const scope = {
    scope: 'scope',
    getState: () => ({ status }),
    getCommands: () => (pending ? [{ id: 'command', status: 'confirming' }] : []),
    getStarts: () => [],
    subscribeOperations: (listener: () => void) => {
      operations.add(listener);
      return () => {
        operations.delete(listener);
      };
    },
    subscribeState: () => unsubscribe,
    dispose: jest.fn(() => {
      status = 'retired';
      lease.release();
    }),
    drain: () => drain.promise,
    admitted() {
      pending = true;
    },
    settled() {
      pending = false;
      for (const listener of operations) listener();
    },
    finishDrain() {
      drain.resolve();
    },
    unsubscribe,
  };
  return scope;
}
jest.mock('../RemoteAgentScope', () => ({
  RemoteAgentScope: jest.fn((lease: DesktopDomainLease) => {
    const scope = mockScope(lease);
    mockScopes.push(scope);
    return scope;
  }),
}));
const signal = () => new AbortController().signal;
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
let runtime: RemoteAgentRuntime;
let retain: jest.Mock;
let lease: DesktopDomainLease;
beforeEach(async () => {
  mockScopes.length = 0;
  lease = { release: jest.fn() } as unknown as DesktopDomainLease;
  retain = jest.fn(async () => lease);
  runtime = new RemoteAgentRuntime();
  runtime.configure({
    connections: { retain, revoke: jest.fn(), subscribeInvalidation: () => () => undefined },
    journal: {} as never,
  });
  await runtime._doInit();
});
afterEach(async () => {
  for (const scope of mockScopes) scope.finishDrain();
  await runtime._doStop();
  await runtime._doDestroy();
});

it('one cancelled acquisition cannot release the scope awaited by another route', async () => {
  const dial = deferred<DesktopDomainLease>();
  retain.mockReturnValue(dial.promise);
  const cancelled = new AbortController();
  const first = runtime.open('pc', cancelled.signal);
  const second = runtime.open('pc', signal());
  cancelled.abort();
  dial.resolve(lease);
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  const source = await second;
  expect(retain).toHaveBeenCalledTimes(1);
  expect(source.getState().status).toBe('ready');
  expect(lease.release).not.toHaveBeenCalled();
  source.dispose();
  expect(lease.release).toHaveBeenCalledTimes(1);
});

it('retains admitted work after the last route leaves, then drains it before host shutdown completes', async () => {
  const source = await runtime.open('pc', signal());
  const scope = mockScopes[0];
  scope.admitted();
  source.dispose();
  expect(lease.release).not.toHaveBeenCalled();
  scope.settled();
  await settle();
  expect(lease.release).toHaveBeenCalledTimes(1);
  let stopped = false;
  const stop = runtime._doStop().then(() => {
    stopped = true;
  });
  await settle();
  expect(stopped).toBe(false);
  scope.finishDrain();
  await stop;
  expect(stopped).toBe(true);
});

it('closes a late acquisition during shutdown without constructing a new scope', async () => {
  const dial = deferred<DesktopDomainLease>();
  retain.mockReturnValue(dial.promise);
  const opening = runtime.open('pc', signal());
  const stopping = runtime._doStop();
  dial.resolve(lease);
  await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
  await stopping;
  expect(mockScopes).toHaveLength(0);
  expect(lease.release).toHaveBeenCalledTimes(1);
});

it('releases a scope when every waiting consumer cancels before acquisition completes', async () => {
  const dial = deferred<DesktopDomainLease>();
  retain.mockReturnValue(dial.promise);
  const first = new AbortController();
  const second = new AbortController();
  const openings = [runtime.open('pc', first.signal), runtime.open('pc', second.signal)];
  first.abort();
  second.abort();
  dial.resolve(lease);
  const results = await Promise.allSettled(openings);
  expect(results.every((result) => result.status === 'rejected')).toBe(true);
  expect(lease.release).toHaveBeenCalledTimes(1);
});

it('unsubscribes a released source exactly once even when the consumer later cleans up', async () => {
  const source = await runtime.open('pc', signal());
  const cleanup = source.subscribeState(() => {});
  source.dispose();
  const count = mockScopes[0].unsubscribe.mock.calls.length;
  cleanup();
  source.dispose();
  expect(mockScopes[0].unsubscribe).toHaveBeenCalledTimes(count);
  expect(lease.release).toHaveBeenCalledTimes(1);
});
