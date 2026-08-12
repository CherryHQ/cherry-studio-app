import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { ResourceScopeCoordinator } from '@/backend/core/resources/ResourceScopeCoordinator';
import type { AssistantService } from '@/backend/data/services/AssistantService';

import { createAssistantHandlers } from '../assistants';

// Deleting an assistant *with* its topics drains those topics first, so the
// route reaches the topic singleton for their ids. This suite is about query
// parsing and forwarding, so that read is stubbed; the drain itself is covered
// in `deletionScopes.test.ts`.
jest.mock('@/backend/data/services/TopicService', () => ({
  topicService: { listIdsByAssistantId: async () => [] },
}));

const ASSISTANT_ID = '00000000-0000-4000-8000-000000000001';
const GROUP_ID = '11111111-1111-4111-8111-111111111111';

function createService() {
  return {
    create: jest.fn(async () => ({})),
    createFromImport: jest.fn(async () => ({})),
    delete: jest.fn(async () => ({ deleted: true })),
    getById: jest.fn(async () => ({})),
    list: jest.fn(async () => ({ items: [], page: 1, total: 0 })),
    reorder: jest.fn(async () => undefined),
    reorderBatch: jest.fn(async () => undefined),
    update: jest.fn(async () => ({})),
  };
}

describe('assistant handlers', () => {
  beforeEach(async () => {
    await installTestHost({ ResourceScopeCoordinator: new ResourceScopeCoordinator() });
  });

  afterEach(uninstallTestHost);

  test('parses and forwards desktop list query fields', async () => {
    const service = createService();
    const handlers = createAssistantHandlers(service as unknown as AssistantService);

    await handlers['/assistants'].GET({
      query: {
        groupId: GROUP_ID,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
        updatedAtFrom: '2026-05-01T00:00:00.000Z',
      },
    });

    expect(service.list).toHaveBeenCalledWith({
      groupId: GROUP_ID,
      limit: 100,
      page: 1,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      updatedAtFrom: '2026-05-01T00:00:00.000Z',
    });
  });

  test('normalizes legacy imports and rejects fields outside the import contract', async () => {
    const service = createService();
    const handlers = createAssistantHandlers(service as unknown as AssistantService);
    const groupName = 'x'.repeat(65);

    await handlers['/assistants:import'].POST({
      body: { groupName: `  ${groupName}  `, name: 'Imported', prompt: 'legacy prompt' },
    });
    expect(service.createFromImport).toHaveBeenCalledWith({
      groupName,
      name: 'Imported',
      prompt: 'legacy prompt',
    });

    await expect(
      handlers['/assistants:import'].POST({
        body: { groupId: GROUP_ID, name: 'Invalid' } as never,
      }),
    ).rejects.toThrow();
    expect(service.createFromImport).toHaveBeenCalledTimes(1);
  });

  test('preserves a group-only partial update and validates group ids', async () => {
    const service = createService();
    const handlers = createAssistantHandlers(service as unknown as AssistantService);

    await handlers['/assistants/:id'].PATCH({
      body: { groupId: GROUP_ID },
      params: { id: ASSISTANT_ID },
    });
    expect(service.update).toHaveBeenCalledWith(ASSISTANT_ID, { groupId: GROUP_ID });

    await expect(
      handlers['/assistants/:id'].PATCH({
        body: { groupId: 'not-a-uuid' } as never,
        params: { id: ASSISTANT_ID },
      }),
    ).rejects.toThrow();
    expect(service.update).toHaveBeenCalledTimes(1);
  });

  test('preserves topics by default and forwards explicit topic deletion', async () => {
    const service = createService();
    const handlers = createAssistantHandlers(service as unknown as AssistantService);

    await handlers['/assistants/:id'].DELETE({ params: { id: ASSISTANT_ID } });
    await handlers['/assistants/:id'].DELETE({
      params: { id: ASSISTANT_ID },
      query: { deleteTopics: true },
    });

    expect(service.delete).toHaveBeenNthCalledWith(1, ASSISTANT_ID, { deleteTopics: false });
    expect(service.delete).toHaveBeenNthCalledWith(2, ASSISTANT_ID, { deleteTopics: true });
  });

  test('rejects malformed reorder requests before delegation', async () => {
    const service = createService();
    const handlers = createAssistantHandlers(service as unknown as AssistantService);

    await expect(
      handlers['/assistants/:id/order'].PATCH({
        body: {} as never,
        params: { id: ASSISTANT_ID },
      }),
    ).rejects.toThrow();
    expect(service.reorder).not.toHaveBeenCalled();
  });
});
