import { resolveChatRestoreState } from '../chatRestore';

describe('shared chat restore target', () => {
  test('restores the Agent found by ID even when it is outside the first 500 list entries', () => {
    expect(
      resolveChatRestoreState({
        agents: {
          isLoading: false,
          items: Array.from({ length: 500 }, (_, index) => ({ id: `agent-${index + 1}` })),
        },
        lastAgent: { isLoading: false, items: [{ id: 'agent-501' }] },
      }),
    ).toEqual({
      status: 'ready',
      target: { agentId: 'agent-501', kind: 'draft' },
    });
  });

  test.each([undefined, { isLoading: false, items: [] }])(
    'falls back to the first available Agent when the saved selection is absent or missing: %j',
    (lastAgent) => {
      expect(
        resolveChatRestoreState({
          agents: { isLoading: false, items: [{ id: 'agent-1' }, { id: 'agent-2' }] },
          lastAgent,
        }),
      ).toEqual({
        status: 'ready',
        target: { agentId: 'agent-1', kind: 'draft' },
      });
    },
  );

  test('waits for the ID lookup instead of using an already available fallback', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: false, items: [{ id: 'agent-1' }] },
        lastAgent: { isLoading: true, items: [] },
      }),
    ).toEqual({ status: 'loading' });
  });

  test('reports an ID lookup failure instead of treating the Agent as missing', () => {
    const error = new Error('ID lookup failed');
    expect(
      resolveChatRestoreState({
        agents: { isLoading: false, items: [{ id: 'agent-1' }] },
        lastAgent: { error, isLoading: false, items: [] },
      }),
    ).toEqual({ error, status: 'error' });
  });

  test('restores the remembered Agent without waiting for the fallback query', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: true, items: [] },
        lastAgent: { isLoading: false, items: [{ id: 'agent-501' }] },
      }),
    ).toEqual({
      status: 'ready',
      target: { agentId: 'agent-501', kind: 'draft' },
    });
  });

  test('waits for Agents before choosing a draft or empty state', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: true, items: [] },
        lastAgent: { isLoading: false, items: [] },
      }),
    ).toEqual({ status: 'loading' });
  });

  test('reports Agent loading errors instead of opening a draft', () => {
    const error = new Error('Agents unavailable');

    expect(
      resolveChatRestoreState({
        agents: { error, isLoading: false, items: [{ id: 'agent-1' }] },
        lastAgent: { isLoading: false, items: [] },
      }),
    ).toEqual({ error, status: 'error' });
  });

  test('uses the no-Agent empty state when no Agent exists', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: false, items: [] },
        lastAgent: { isLoading: false, items: [] },
      }),
    ).toEqual({ status: 'empty' });
  });
});
