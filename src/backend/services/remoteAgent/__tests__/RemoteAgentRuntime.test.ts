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
  let executing = false;
  const operations = new Set<() => void>();
  const executionListeners = new Set<() => void>();
  const drain = deferred<void>();
  const unsubscribe = jest.fn();
  const scope = {
    scope: 'scope',
    draftScope: lease.scope,
    listAgents: jest.fn(async () => ({ items: [] })),
    tasks: {
      list: jest.fn(async () => ({ items: [] })),
      listSessions: jest.fn(async () => ({ items: [] })),
      readSession: jest.fn(),
    },
    hasPendingExecution: () => pending || executing,
    subscribeExecution: (listener: () => void) => {
      executionListeners.add(listener);
      return () => {
        executionListeners.delete(listener);
      };
    },
    getState: () => ({ status }),
    getCommands: () => (pending ? [{ id: 'command', status: 'pending' }] : []),
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
    executing(value: boolean) {
      executing = value;
      for (const listener of executionListeners) listener();
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
let prewarmAgent: jest.Mock;
let lease: DesktopDomainLease;
beforeEach(async () => {
  mockScopes.length = 0;
  lease = { scope: 'binding', release: jest.fn() } as unknown as DesktopDomainLease;
  retain = jest.fn(async () => lease);
  prewarmAgent = jest.fn();
  runtime = new RemoteAgentRuntime();
  runtime.configure({
    connections: {
      retain,
      prewarmAgent,
      revoke: jest.fn(),
      subscribeInvalidation: () => () => undefined,
    },
    journal: {} as never,
  });
  await runtime._doInit();
});
afterEach(async () => {
  for (const scope of mockScopes) scope.finishDrain();
  await runtime._doStop();
  await runtime._doDestroy();
});

it('hands an in-flight first page to the selected binding without activating a speculative scope', async () => {
  const pending = deferred<{ items: { agentId: string; name: string }[] }>();
  const request = jest.fn(() => pending.promise);
  prewarmAgent.mockResolvedValue({
    scope: 'binding',
    signal: signal(),
    release: jest.fn(),
    ready: async () => ({ request }),
  });
  const warming = runtime.prewarm('pc', 'agents', signal());
  await settle();
  expect(mockScopes).toHaveLength(0);
  const source = await runtime.open('pc', signal());
  const firstPage = source.listAgents(undefined, signal());
  pending.resolve({ items: [{ agentId: 'a', name: 'Research' }] });
  await warming;
  await expect(firstPage).resolves.toMatchObject({ items: [{ id: 'a', name: 'Research' }] });
  expect(request).toHaveBeenCalledTimes(1);
  expect(mockScopes[0].listAgents).not.toHaveBeenCalled();
  await source.listAgents(undefined, signal());
  expect(mockScopes[0].listAgents).toHaveBeenCalledTimes(1);
  source.dispose();
});

it('warms the transport alone for the sessions view', async () => {
  const request = jest.fn();
  const ready = jest.fn(async () => ({ request }));
  prewarmAgent.mockResolvedValue({ scope: 'binding', signal: signal(), release: jest.fn(), ready });
  await runtime.prewarm('pc', 'sessions', signal());
  expect(prewarmAgent).toHaveBeenCalledTimes(1);
  expect(ready).toHaveBeenCalledTimes(1);
  expect(request).not.toHaveBeenCalled();
  expect(mockScopes).toHaveLength(0);
});

it.each(['agents', 'sessions'] as const)(
  'releases the speculative lease immediately in %s view when the desktop is offline',
  async (view) => {
    const release = jest.fn();
    prewarmAgent.mockResolvedValue({
      scope: 'binding',
      signal: signal(),
      release,
      ready: async () => {
        throw new Error('offline');
      },
    });
    await expect(runtime.prewarm('pc', view, signal())).rejects.toThrow('offline');
    expect(release).toHaveBeenCalledTimes(1);
  },
);

it('does not send a speculative agent list request if selection starts while prewarm is acquiring', async () => {
  const pendingLease = deferred<DesktopDomainLease>();
  prewarmAgent.mockReturnValue(pendingLease.promise);
  const dial = deferred<DesktopDomainLease>();
  retain.mockReturnValue(dial.promise);
  const request = jest.fn();
  const warming = runtime.prewarm('pc', 'agents', signal());
  const opening = runtime.open('pc', signal());
  pendingLease.resolve({
    scope: 'binding',
    signal: signal(),
    release: jest.fn(),
    ready: async () => ({ request }),
  } as unknown as DesktopDomainLease);
  await warming;
  expect(request).not.toHaveBeenCalled();
  dial.resolve(lease);
  const source = await opening;
  source.dispose();
});

it('ignores a prepared catalog after the desktop binding changes', async () => {
  prewarmAgent.mockResolvedValue({
    scope: 'old-binding',
    signal: signal(),
    release: jest.fn(),
    ready: async () => ({
      request: async () => ({ items: [{ agentId: 'retired', name: 'Old' }] }),
    }),
  });
  await runtime.prewarm('pc', 'agents', signal());
  const source = await runtime.open('pc', signal());
  await expect(source.listAgents(undefined, signal())).resolves.toEqual({ items: [] });
  source.dispose();
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

it("retires a released caller's task capability while another caller retains the shared scope", async () => {
  const first = await runtime.open('pc', signal());
  const second = await runtime.open('pc', signal());
  const tasks = first.tasks;
  first.dispose();
  expect(lease.release).not.toHaveBeenCalled();
  expect(() => tasks.list(undefined, signal())).toThrow('Source released');
  expect(() => tasks.listSessions('task', undefined, signal())).toThrow('Source released');
  expect(() => tasks.readSession('task', 'session', signal())).toThrow('Source released');
  expect(mockScopes[0].tasks.list).not.toHaveBeenCalled();
  await expect(second.tasks.list(undefined, signal())).resolves.toEqual({ items: [] });
  second.dispose();
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

it('retains running execution after receipts settle and disposes only after the execution ends', async () => {
  const source = await runtime.open('pc', signal());
  const scope = mockScopes[0]!;
  scope.executing(true);
  source.dispose();
  await settle();
  expect(lease.release).not.toHaveBeenCalled();
  scope.executing(false);
  await settle();
  expect(lease.release).toHaveBeenCalledTimes(1);
});
