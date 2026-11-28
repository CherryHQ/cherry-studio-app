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

  test('reads session resources and rejects an already-cancelled query', async () => {
    const resources = { dispatches: [], files: [{ fileEntryId: 'artifact' }] };
    const service = { readResources: jest.fn(async () => resources) };
    const handlers = createAgentSessionMessageHandlers(
      service as unknown as AgentSessionMessageService,
    );
    const handler = handlers['/agent-sessions/:sessionId/messages/resources'].GET;
    const params = { sessionId: 'session-1' };
    const controller = new AbortController();
    controller.abort();

    await expect(handler({ params, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(service.readResources).not.toHaveBeenCalled();
    await expect(handler({ params })).resolves.toBe(resources);
    expect(service.readResources).toHaveBeenCalledWith('session-1');
  });
});
