import type { AgentProtocol, AgentSessionStatus } from '@/shared/contracts/agent';
import type { ApiClient } from '@/shared/data/api/types';

import { createLocalConversationSource } from '../createLocalConversationSource';

const session = {
  id: 'session',
  agentId: 'agent',
  name: 'Conversation',
  createdAt: '2026-09-21T00:00:00.000Z',
  forkedFromSessionId: null,
  hasChildren: true,
  lastActivityAt: '2026-09-22T00:00:00.000Z',
};
function fixture() {
  const turns = new Map<string, AgentSessionStatus>();
  let readMark: string | undefined;
  const statusListeners = new Set<() => void>();
  const allStatusListeners = new Set<() => void>();
  const readListeners = new Set<() => void>();
  const changes = new Set<(paths: readonly string[]) => void>();
  const protocol = {
    getSessionStatus: (id: string) => turns.get(id) ?? null,
    getSessionStatusIds: () => [...turns.keys()],
    subscribeSessionStatuses: (listener: () => void) => {
      allStatusListeners.add(listener);
      return () => {
        allStatusListeners.delete(listener);
      };
    },
    subscribeSessionStatus: (_id: string, listener: () => void) => {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
    renameSession: jest.fn(async () => undefined),
    deleteSession: jest.fn(async () => undefined),
    observeSession: jest.fn(),
  };
  const api = {
    subscribeChanges: (listener: (paths: readonly string[]) => void) => {
      changes.add(listener);
      return () => {
        changes.delete(listener);
      };
    },
    get: jest.fn(async (path: string, _options?: { signal?: AbortSignal }) => {
      if (path === '/agents')
        return { items: [{ id: 'agent', name: 'Agent', model: 'model' }], total: 1 };
      if (path.endsWith('/path'))
        return [
          { ...session, id: 'root', hasChildren: true },
          { ...session, forkedFromSessionId: 'root' },
        ];
      if (path === '/agent-sessions') return { items: [session], nextCursor: null };
      return session;
    }),
  };
  const sessionChanged = jest.fn();
  const source = createLocalConversationSource({
    readMarks: {
      get: () => readMark,
      subscribe: (_id, listener) => {
        readListeners.add(listener);
        return () => {
          readListeners.delete(listener);
        };
      },
    },
    agent: protocol as unknown as AgentProtocol,
    api: api as unknown as ApiClient,
    onSessionChanged: sessionChanged,
  });
  return {
    source,
    protocol,
    api,
    sessionChanged,
    signal: new AbortController().signal,
    changes,
    statusListeners,
    allStatusListeners,
    readListeners,
    setTurn(value: AgentSessionStatus, id = 'session') {
      turns.set(id, value);
      for (const listener of statusListeners) listener();
      for (const listener of allStatusListeners) listener();
    },
    markRead(value: string) {
      readMark = value;
      for (const listener of readListeners) listener();
    },
  };
}

test('lists Agents and Sessions as source-local addresses without opening transcripts', async () => {
  const f = fixture();
  const agents = await f.source.catalog.listAgents(undefined, f.signal);
  expect(agents.items[0]).toMatchObject({ id: 'agent', name: 'Agent', configuration: 'available' });
  const sessions = await f.source.catalog.listSessions(
    { agent: agents.items[0].ref },
    undefined,
    f.signal,
  );
  expect(sessions.items[0]).toEqual({
    ref: { source: { kind: 'local' }, sessionId: 'session' },
    agentId: 'agent',
    title: 'Conversation',
    createdAt: session.createdAt,
    forkedFromSessionId: null,
    hasChildren: true,
    updatedAt: session.lastActivityAt,
  });
  expect(f.api.get).toHaveBeenLastCalledWith(
    '/agent-sessions',
    expect.objectContaining({ query: { agentId: 'agent', cursor: undefined, groupBy: 'root' } }),
  );
  expect(f.protocol.observeSession).not.toHaveBeenCalled();
  f.source.dispose();
  await expect(f.source.catalog.listAgents(undefined, f.signal)).rejects.toMatchObject({
    failure: { code: 'retired' },
  });
});

test('loads only an expanded conversation’s direct children without opening a transcript', async () => {
  const f = fixture();
  const root = { source: { kind: 'local' } as const, sessionId: 'main' };
  await f.source.catalog.listSessionChildren!(root, undefined, f.signal);
  expect(f.api.get).toHaveBeenCalledWith(
    '/agent-sessions',
    expect.objectContaining({
      query: { agentId: undefined, parentSessionId: 'main', cursor: undefined },
    }),
  );
  expect(f.protocol.observeSession).not.toHaveBeenCalled();
  f.source.dispose();
});

test('reads a complete source path in one metadata request', async () => {
  const f = fixture();
  const address = { source: f.source.ref, sessionId: 'session' };
  const path = await f.source.catalog.readSessionPath!(address, f.signal);
  expect(path.map(({ ref, forkedFromSessionId }) => [ref.sessionId, forkedFromSessionId])).toEqual([
    ['root', null],
    ['session', 'root'],
  ]);
  expect(f.api.get).toHaveBeenCalledTimes(1);
  expect(f.api.get).toHaveBeenCalledWith('/agent-sessions/session/path', { signal: f.signal });
  expect(f.protocol.observeSession).not.toHaveBeenCalled();
  f.source.dispose();
});

test('catalog previews retain status and unread updates without opening transcripts', async () => {
  const f = fixture();
  const ref = { source: f.source.ref, sessionId: 'session' };
  const metadata = await f.source.catalog.readSession!(ref, f.signal);
  expect(metadata).toMatchObject({ agentId: 'agent', title: 'Conversation' });
  const preview = f.source.catalog.previewSession!(ref);
  const changed = jest.fn();
  const release = preview.status!.subscribe(changed);
  f.setTurn({ turnId: 'turn', status: 'running' });
  expect(preview.status!.getSnapshot()).toBe('running');
  f.setTurn({ turnId: 'turn', status: 'awaiting-approval' });
  expect(preview.status!.getSnapshot()).toBe('awaiting-approval');
  f.setTurn({ turnId: 'turn', status: 'awaiting-input' });
  expect(preview.status!.getSnapshot()).toBe('awaiting-input');
  f.setTurn({ turnId: 'turn', status: 'completed' });
  expect(preview.status!.getSnapshot()).toBe('unread');
  f.markRead('turn');
  expect(preview.status!.getSnapshot()).toBeUndefined();
  expect(changed).toHaveBeenCalledTimes(5);
  expect(f.protocol.observeSession).not.toHaveBeenCalled();
  release();
  expect(f.statusListeners.size).toBe(0);
  expect(f.readListeners.size).toBe(0);
  f.source.dispose();
});

test('collapsed groups share off-page status paths and clear completed hints after reading', async () => {
  const f = fixture();
  const agents = await f.source.catalog.listAgents(undefined, f.signal);
  f.api.get.mockClear();
  f.setTurn({ turnId: 'turn', status: 'running' });
  const family = f.source.catalog.previewSession!(
    { source: f.source.ref, sessionId: 'root' },
    { includeDescendants: true },
  ).status!;
  const agent = f.source.catalog.previewAgent!(agents.items[0]!.ref);
  const unrelated = f.source.catalog.previewSession!(
    { source: f.source.ref, sessionId: 'unrelated' },
    { includeDescendants: true },
  ).status!;
  const releaseFamily = family.subscribe(jest.fn());
  const releaseAgent = agent.subscribe(jest.fn());
  await f.api.get.mock.results[0]!.value;
  expect(f.api.get).toHaveBeenCalledTimes(1);
  expect(f.api.get).toHaveBeenCalledWith('/agent-sessions/session/path', {
    signal: expect.any(AbortSignal),
  });
  expect(family.getSnapshot()).toBe('running');
  expect(agent.getSnapshot()).toBe('running');
  expect(unrelated.getSnapshot()).toBeUndefined();
  f.setTurn({ turnId: 'root-turn', status: 'running' }, 'root');
  f.setTurn({ turnId: 'turn', status: 'awaiting-approval' });
  expect(family.getSnapshot()).toBe('awaiting-approval');
  f.setTurn({ turnId: 'root-turn', status: 'cancelled' }, 'root');
  f.setTurn({ turnId: 'turn', status: 'awaiting-input' });
  expect(family.getSnapshot()).toBe('awaiting-input');
  f.setTurn({ turnId: 'turn', status: 'failed' });
  expect(family.getSnapshot()).toBe('failed');
  f.setTurn({ turnId: 'turn', status: 'completed' });
  expect(family.getSnapshot()).toBe('unread');
  f.markRead('turn');
  expect(family.getSnapshot()).toBeUndefined();
  expect(agent.getSnapshot()).toBeUndefined();
  releaseFamily();
  expect(f.allStatusListeners.size).toBe(1);
  releaseAgent();
  expect(f.allStatusListeners.size).toBe(0);
  expect(f.readListeners.size).toBe(0);
  expect(f.changes.size).toBe(0);
  expect(f.protocol.observeSession).not.toHaveBeenCalled();
  f.source.dispose();
});

test('releasing the last collapsed group cancels pending metadata and ignores late results', async () => {
  const f = fixture();
  let resolve!: (path: (typeof session)[]) => void;
  const pending = new Promise<(typeof session)[]>((done) => {
    resolve = done;
  });
  f.api.get.mockImplementationOnce(() => pending);
  f.setTurn({ turnId: 'turn', status: 'running' });
  const family = f.source.catalog.previewSession!(
    { source: f.source.ref, sessionId: 'root' },
    { includeDescendants: true },
  ).status!;
  const changed = jest.fn();
  const release = family.subscribe(changed);
  const signal = f.api.get.mock.calls[0]![1]!.signal!;
  release();
  expect(signal.aborted).toBe(true);
  changed.mockClear();
  resolve([{ ...session, id: 'root' }, session]);
  await pending;
  expect(changed).not.toHaveBeenCalled();
  expect(family.getSnapshot()).toBeUndefined();
  expect(f.allStatusListeners.size).toBe(0);
  expect(f.readListeners.size).toBe(0);
  f.source.dispose();
});

test('catalog changes and row actions refresh lists, and retired actions cannot mutate', async () => {
  const f = fixture();
  const changed = jest.fn();
  const release = f.source.catalog.subscribe!(changed);
  for (const listener of f.changes) listener(['/agents/agent']);
  expect(changed).toHaveBeenLastCalledWith('agents');
  for (const listener of f.changes) listener(['/agent-sessions/session']);
  expect(changed).toHaveBeenLastCalledWith('sessions');
  changed.mockClear();
  for (const listener of f.changes) listener(['/agent-sessions/session/messages']);
  expect(changed).not.toHaveBeenCalled();
  const preview = f.source.catalog.previewSession!({ source: f.source.ref, sessionId: 'session' });
  expect(await preview.rename!.execute({ title: ' Renamed ' })).toMatchObject({ state: 'applied' });
  expect(f.protocol.renameSession).toHaveBeenCalledWith({ sessionId: 'session', name: 'Renamed' });
  expect(changed).toHaveBeenLastCalledWith('sessions');
  expect(f.sessionChanged).toHaveBeenLastCalledWith('session');
  changed.mockClear();
  expect(await preview.remove!.execute(undefined)).toMatchObject({ state: 'applied' });
  expect(f.protocol.deleteSession).toHaveBeenCalledWith({ sessionId: 'session' });
  expect(changed).toHaveBeenCalledWith('sessions');
  f.source.dispose();
  expect(f.changes.size).toBe(0);
  expect(await preview.remove!.execute(undefined)).toMatchObject({
    state: 'rejected',
    failure: { code: 'retired' },
  });
  expect(f.protocol.deleteSession).toHaveBeenCalledTimes(1);
  expect(f.protocol.observeSession).not.toHaveBeenCalled();
  release();
});

test('only active catalog consumers retain the local change subscription', () => {
  const f = fixture();
  expect(f.changes.size).toBe(0);
  const releaseFirst = f.source.catalog.subscribe!(jest.fn());
  const releaseSecond = f.source.catalog.subscribe!(jest.fn());
  expect(f.changes.size).toBe(1);
  releaseFirst();
  expect(f.changes.size).toBe(1);
  releaseSecond();
  expect(f.changes.size).toBe(0);
  f.source.dispose();
});
