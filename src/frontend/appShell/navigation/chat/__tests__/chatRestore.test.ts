import { resolveChatRestoreState } from '../chatRestore';

describe('shared chat restore target', () => {
  test('opens a draft for the first available Agent', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: false, items: [{ id: 'agent-1' }, { id: 'agent-2' }] },
      }),
    ).toEqual({
      status: 'ready',
      target: { agentId: 'agent-1', kind: 'draft' },
    });
  });

  test('waits for Agents before choosing a draft or empty state', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: true, items: [] },
      }),
    ).toEqual({ status: 'loading' });
  });

  test('reports Agent loading errors instead of opening a draft', () => {
    const error = new Error('Agents unavailable');

    expect(
      resolveChatRestoreState({
        agents: { error, isLoading: false, items: [{ id: 'agent-1' }] },
      }),
    ).toEqual({ error, status: 'error' });
  });

  test('uses the no-Agent empty state when no Agent exists', () => {
    expect(
      resolveChatRestoreState({
        agents: { isLoading: false, items: [] },
      }),
    ).toEqual({ status: 'empty' });
  });
});
