import { resolveChatRestoreState } from '../chatRestore';

const idleSession = {
  isLoading: false,
  isNotFound: false,
};

describe('shared chat restore target', () => {
  test('prefers the recorded Session over every fallback', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: false, items: [{ id: 'agent-3' }] },
        latestSession: {
          isLoading: false,
          session: { agentId: 'agent-2', id: 'session-2' },
        },
        requestedSession: idleSession,
        storedSession: {
          data: { agentId: 'agent-1', id: 'session-1' },
          isLoading: false,
          isNotFound: false,
          sessionId: 'session-1',
        },
        storedTarget: { agentId: 'agent-1', kind: 'session', sessionId: 'session-1' },
      }),
    ).toEqual({
      status: 'ready',
      target: { agentId: 'agent-1', kind: 'session', sessionId: 'session-1' },
    });
  });

  test('falls through a deleted recorded Session to the globally latest Session', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: false, items: [{ id: 'agent-1' }] },
        latestSession: {
          isLoading: false,
          session: { agentId: 'agent-2', id: 'session-2' },
        },
        requestedSession: idleSession,
        storedSession: {
          error: new Error('not found'),
          isLoading: false,
          isNotFound: true,
          sessionId: 'session-1',
        },
        storedTarget: { agentId: 'agent-1', kind: 'session', sessionId: 'session-1' },
      }),
    ).toEqual({
      status: 'ready',
      target: { agentId: 'agent-2', kind: 'session', sessionId: 'session-2' },
    });
  });

  test('uses the recorded Agent draft before the first Agent fallback', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: false, items: [{ id: 'agent-1' }, { id: 'agent-2' }] },
        latestSession: { isLoading: false },
        requestedSession: idleSession,
        storedSession: idleSession,
        storedTarget: { agentId: 'agent-2', kind: 'draft' },
      }),
    ).toEqual({
      status: 'ready',
      target: { agentId: 'agent-2', kind: 'draft' },
    });
  });

  test('uses the no-Agent empty state only after every fallback is exhausted', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: false, items: [] },
        latestSession: { isLoading: false },
        requestedSession: idleSession,
        storedSession: idleSession,
      }),
    ).toEqual({ status: 'empty' });
  });
});
