import type { AgentSessionService } from '@/backend/data/services/AgentSessionService';
import { AgentProtocolError } from '@/shared/contracts/agent';

import { type AgentSessionMutations, createAgentSessionHandlers } from '../agentSessions';

function createService() {
  return {
    getById: jest.fn(async () => ({ id: 'session-1' })),
    listByCursor: jest.fn(async () => ({ items: [] })),
  };
}

function createMutations() {
  return {
    deleteSession: jest.fn(async () => undefined),
    renameSession: jest.fn(async () => ({})),
  };
}

describe('agent session handlers', () => {
  test('parses list pagination before delegation', async () => {
    const service = createService();
    const mutations = createMutations();
    const handlers = createAgentSessionHandlers(
      service as unknown as AgentSessionService,
      mutations as unknown as AgentSessionMutations,
    );

    await handlers['/agent-sessions'].GET({ query: { agentId: 'agent-1', limit: '25' as never } });

    expect(service.listByCursor).toHaveBeenCalledWith({ agentId: 'agent-1', limit: 25 });
  });

  test('routes rename and delete through the Host mutation boundary', async () => {
    const service = createService();
    const mutations = createMutations();
    const handlers = createAgentSessionHandlers(
      service as unknown as AgentSessionService,
      mutations as unknown as AgentSessionMutations,
    );

    await handlers['/agent-sessions/:id'].PATCH({
      body: { title: '  Renamed  ' },
      params: { id: 'session-1' },
    });
    await handlers['/agent-sessions/:id'].DELETE({ params: { id: 'session-1' } });

    expect(mutations.renameSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      title: 'Renamed',
    });
    expect(service.getById).toHaveBeenCalledWith('session-1');
    expect(mutations.deleteSession).toHaveBeenCalledWith({ sessionId: 'session-1' });
  });

  test('maps a missing Host session to the Data API not-found contract', async () => {
    const service = createService();
    const mutations = createMutations();
    mutations.deleteSession.mockRejectedValueOnce(
      new AgentProtocolError({
        code: 'SESSION_NOT_FOUND',
        message: 'missing',
        retryable: false,
      }),
    );
    const handlers = createAgentSessionHandlers(
      service as unknown as AgentSessionService,
      mutations as unknown as AgentSessionMutations,
    );

    await expect(
      handlers['/agent-sessions/:id'].DELETE({ params: { id: 'missing' } }),
    ).rejects.toMatchObject({ details: { id: 'missing', resource: 'AgentSession' } });
  });
});
