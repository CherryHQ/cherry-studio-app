import type { TeamAgentModule, TeamDirectoryState } from '@/shared/contracts/teamAgent';

import { createTeamConversationSource } from '../createTeamConversationSource';

const ready: TeamDirectoryState = {
  context: { bindingId: 'enterprise', key: 'account' },
  phase: 'ready',
  agents: [{ id: 'agent', name: 'Agent', canCreateSession: true }],
};
const denied: TeamDirectoryState = {
  ...ready,
  phase: 'error',
  failure: 'not-visible',
  agents: [],
};
const session = { agentId: 'agent', sessionId: 'session', canDelete: true };

function fixture(initial = ready) {
  let directory = initial;
  const directoryListeners = new Set<() => void>();
  const sessionListeners = new Set<() => void>();
  const listSessions = jest.fn(async () => [session]);
  const module: TeamAgentModule = {
    getState: () => directory,
    subscribe: (listener) => {
      directoryListeners.add(listener);
      return () => directoryListeners.delete(listener);
    },
    subscribeSessions: (listener) => {
      sessionListeners.add(listener);
      return () => sessionListeners.delete(listener);
    },
    refresh: async () => {},
    listSessions,
    createSession: async () => session,
    deleteSession: async () => {},
    readDetail: async () => ({ skills: [], mcp: [] }),
    readPortrait: async () => undefined,
    observe: () => {
      throw new Error('Unexpected conversation observation');
    },
    readDraft: () => '',
    writeDraft: () => {},
  };
  return {
    source: createTeamConversationSource('enterprise', module),
    listSessions,
    publishDirectory(next: TeamDirectoryState) {
      directory = next;
      for (const listener of directoryListeners) listener();
    },
    publishSessions() {
      for (const listener of sessionListeners) listener();
    },
  };
}

it('starts disabled when the directory has already denied access', () => {
  const { source } = fixture(denied);
  expect(source.state.getSnapshot().availability).toEqual({
    state: 'disabled',
    reason: 'not-authorized',
  });
  source.dispose();
});

it('clears cached session actions on access denial and enables the source on recovery', async () => {
  const { source, listSessions, publishDirectory } = fixture();
  const { signal } = new AbortController();
  const { items } = await source.catalog.listSessions({}, undefined, signal);
  const address = items[0].ref;
  expect(source.catalog.previewSession!(address, {}).remove).toBeDefined();

  const late = Promise.withResolvers<(typeof session)[]>();
  listSessions.mockReturnValueOnce(late.promise);
  const pending = source.catalog.listSessions({}, undefined, signal);
  publishDirectory(denied);
  late.resolve([session]);
  await pending;
  expect(source.state.getSnapshot().availability).toEqual({
    state: 'disabled',
    reason: 'not-authorized',
  });
  expect(source.catalog.previewSession!(address, {}).remove).toBeUndefined();

  publishDirectory(ready);
  expect(source.state.getSnapshot().availability).toEqual({ state: 'enabled' });
  expect(source.catalog.previewSession!(address, {}).remove).toBeUndefined();
  source.dispose();
});

it('emits session changes explicitly or when directory content changes', () => {
  const { source, publishDirectory, publishSessions } = fixture();
  const listener = jest.fn();
  const unsubscribe = source.catalog.subscribe!(listener);
  publishDirectory(ready);
  publishDirectory({ ...ready, agents: ready.agents.map((agent) => ({ ...agent })) });
  expect(listener).not.toHaveBeenCalled();

  publishSessions();
  publishDirectory({ ...ready, agents: [] });
  expect(listener.mock.calls).toEqual([['sessions'], ['agents'], ['sessions']]);
  unsubscribe();
  publishSessions();
  publishDirectory(ready);
  expect(listener).toHaveBeenCalledTimes(3);
  source.dispose();
});
