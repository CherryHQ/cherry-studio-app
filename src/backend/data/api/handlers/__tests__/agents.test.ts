import type { AgentService } from '@/backend/data/services/AgentService';

import { type AgentAvatars, createAgentHandlers } from '../agents';

const AGENT_ID = '00000000-0000-4000-8000-000000000001';

function createService() {
  return {
    create: jest.fn(async () => ({})),
    delete: jest.fn(async () => ({ deleted: true })),
    getById: jest.fn(async () => ({})),
    list: jest.fn(async () => ({ items: [], page: 1, total: 0 })),
    reorder: jest.fn(async () => undefined),
    reorderBatch: jest.fn(async () => undefined),
    update: jest.fn(async () => ({})),
  };
}

function createAvatars() {
  return {
    setAvatar: jest.fn(async () => ({})),
    withUri: jest.fn(async (agent: unknown) => agent),
    withUris: jest.fn(async (agents: unknown) => agents),
  } as unknown as AgentAvatars;
}

describe('agent handlers', () => {
  test('parses list pagination and sorting before delegation', async () => {
    const service = createService();
    const handlers = createAgentHandlers(service as unknown as AgentService, createAvatars());

    await handlers['/agents'].GET({
      query: { page: '2' as never, search: 'research', sortBy: 'updatedAt', sortOrder: 'desc' },
    });

    expect(service.list).toHaveBeenCalledWith({
      limit: 100,
      page: 2,
      search: 'research',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
  });

  test('preserves partial updates and the explicit model clear operation', async () => {
    const service = createService();
    const handlers = createAgentHandlers(service as unknown as AgentService, createAvatars());

    await handlers['/agents/:id'].PATCH({
      body: { modelId: null },
      params: { id: AGENT_ID },
    });

    expect(service.update).toHaveBeenCalledWith(AGENT_ID, { modelId: null });

    await expect(
      handlers['/agents/:id'].PATCH({
        body: { modelId: 'not-a-unique-model-id' } as never,
        params: { id: AGENT_ID },
      }),
    ).rejects.toThrow();
    expect(service.update).toHaveBeenCalledTimes(1);
  });

  test('rejects malformed reorder requests before delegation', async () => {
    const service = createService();
    const handlers = createAgentHandlers(service as unknown as AgentService, createAvatars());

    await expect(
      handlers['/agents/:id/order'].PATCH({
        body: {} as never,
        params: { id: AGENT_ID },
      }),
    ).rejects.toThrow();
    expect(service.reorder).not.toHaveBeenCalled();
  });
});
