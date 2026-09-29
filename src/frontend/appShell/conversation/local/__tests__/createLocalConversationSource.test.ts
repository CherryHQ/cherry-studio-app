import type { AgentProtocol, AgentSessionStatus } from '@/shared/contracts/agent';
import type { ApiClient } from '@/shared/data/api/types';

import { createLocalConversationSource } from '../createLocalConversationSource';

const session = {
  id: 'session',
  agentId: 'agent',
  title: 'Conversation',
  lastActivityAt: '2026-09-22T00:00:00.000Z',
};
function fixture() {
  let turn: AgentSessionStatus | null = null;
  let readMark: string | undefined;
  const statusListeners = new Set<() => void>();
  const readListeners = new Set<() => void>();
  const changes = new Set<(paths: readonly string[]) => void>();
  const protocol = {
    getSessionStatus: () => turn,
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
    get: jest.fn(async (path: string) => {
      if (path === '/agents')
        return { items: [{ id: 'agent', name: 'Agent', modelId: 'model' }], total: 1 };
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
    readListeners,
    setTurn(value: AgentSessionStatus) {
      turn = value;
      for (const listener of statusListeners) listener();
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
    updatedAt: session.lastActivityAt,
  });
  expect(f.api.get).toHaveBeenLastCalledWith(
    '/agent-sessions',
    expect.objectContaining({ query: { agentId: 'agent', cursor: undefined } }),
  );
  expect(f.protocol.observeSession).not.toHaveBeenCalled();
  f.source.dispose();
  await expect(f.source.catalog.listAgents(undefined, f.signal)).rejects.toMatchObject({
    failure: { code: 'retired' },
  });
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

test('catalog changes and row actions refresh lists, and retired actions cannot mutate', async () => {
  const f = fixture();
  const changed = jest.fn();
  const release = f.source.catalog.subscribe!(changed);
  for (const listener of f.changes) listener(['/agents/agent']);
  expect(changed).toHaveBeenLastCalledWith('agents');
  for (const listener of f.changes) listener(['/agent-sessions/session']);
  expect(changed).toHaveBeenLastCalledWith('sessions');
  const preview = f.source.catalog.previewSession!({ source: f.source.ref, sessionId: 'session' });
  expect(await preview.rename!.execute({ title: ' Renamed ' })).toMatchObject({ state: 'applied' });
  expect(f.protocol.renameSession).toHaveBeenCalledWith({ sessionId: 'session', title: 'Renamed' });
  expect(changed).toHaveBeenLastCalledWith('sessions');
  expect(f.sessionChanged).toHaveBeenLastCalledWith('session');
  expect(await preview.remove!.execute(undefined)).toMatchObject({ state: 'applied' });
  expect(f.protocol.deleteSession).toHaveBeenCalledWith({ sessionId: 'session' });
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
