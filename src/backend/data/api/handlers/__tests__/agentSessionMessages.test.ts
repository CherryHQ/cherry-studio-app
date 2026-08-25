import type { AgentSessionMessageService } from '@/backend/data/services/AgentSessionMessageService';

import { createAgentSessionMessageHandlers } from '../agentSessionMessages';

describe('agent session message handlers', () => {
  test('parses pagination and delegates the parent session id', async () => {
    const service = {
      listByCursor: jest.fn(async () => ({ items: [] })),
    };
    const handlers = createAgentSessionMessageHandlers(
      service as unknown as AgentSessionMessageService,
    );

    await handlers['/agent-sessions/:sessionId/messages'].GET({
      params: { sessionId: 'session-1' },
      query: { cursor: '100:message-1', limit: '25' as never },
    });

    expect(service.listByCursor).toHaveBeenCalledWith('session-1', {
      cursor: '100:message-1',
      limit: 25,
    });
  });
});
