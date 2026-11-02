import { resolveChatRestoreState } from '../chatRestore';

describe('shared chat restore target', () => {
  test('opens a draft for the remembered Agent even when another Agent sorts first', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: false, items: [{ id: 'agent-1' }, { id: 'agent-2' }] },
        lastAgentId: 'agent-2',
      }),
    ).toEqual({
      status: 'ready',
      target: { agentId: 'agent-2', kind: 'draft' },
    });
  });

  test.each([null, 'deleted-agent'])(
    'falls back to the first available Agent when the remembered Agent is %s',
    (lastAgentId) => {
      expect(
        resolveChatRestoreState({
          agents: { isLoading: false, items: [{ id: 'agent-1' }, { id: 'agent-2' }] },
          lastAgentId,
        }),
      ).toEqual({
        status: 'ready',
        target: { agentId: 'agent-1', kind: 'draft' },
      });
    },
  );

  test('waits for Agents before choosing a draft or empty state', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: true, items: [] },
        lastAgentId: 'agent-2',
      }),
    ).toEqual({ status: 'loading' });
  });

  test('reports Agent loading errors instead of opening a draft', () => {
    const error = new Error('Agents unavailable');

    expect(
      resolveChatRestoreState({
        agents: { error, isLoading: false, items: [{ id: 'agent-1' }] },
        lastAgentId: 'agent-1',
      }),
    ).toEqual({ error, status: 'error' });
  });

  test('uses the no-Agent empty state when no Agent exists', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: false, items: [] },
        lastAgentId: 'deleted-agent',
      }),
    ).toEqual({ status: 'empty' });
  });
});
