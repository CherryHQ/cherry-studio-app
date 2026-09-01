import { resolveChatRestoreState } from '../chatRestore';

describe('shared chat restore target', () => {
  test('opens the globally latest Session', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: false, items: [{ id: 'agent-3' }] },
        latestSession: { isLoading: false, session: { id: 'session-2' } },
      }),
    ).toEqual({
      status: 'ready',
      target: { kind: 'session', sessionId: 'session-2' },
    });
  });

  test('waits for the latest Session before using an Agent fallback', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: false, items: [{ id: 'agent-1' }] },
        latestSession: { isLoading: true },
      }),
    ).toEqual({ status: 'loading' });
  });

  test('uses the first Agent draft when no Session exists', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: false, items: [{ id: 'agent-1' }, { id: 'agent-2' }] },
        latestSession: { isLoading: false },
      }),
    ).toEqual({
      status: 'ready',
      target: { agentId: 'agent-1', kind: 'draft' },
    });
  });

  test('uses the no-Agent empty state when no Session or Agent exists', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: false, items: [] },
        latestSession: { isLoading: false },
      }),
    ).toEqual({ status: 'empty' });
  });
});
