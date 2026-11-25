import type { ModelService } from '@/backend/data/services/ModelService';

import { createModelHandlers } from '../models';

describe('model Data API handlers', () => {
  function createService() {
    return {
      bulkDelete: jest.fn(async () => undefined),
      bulkUpdate: jest.fn(async () => []),
      createDtos: jest.fn(async () => []),
      deleteByKey: jest.fn(async () => undefined),
      getByKey: jest.fn(async () => ({})),
      list: jest.fn(async () => []),
      reorder: jest.fn(async () => undefined),
      reorderBatch: jest.fn(async () => undefined),
      resolveRegistryModels: jest.fn(async () => []),
      update: jest.fn(async () => ({})),
    };
  }

  test('validates model ids and anchors before delegating reorder requests', async () => {
    const service = createService();
    const handlers = createModelHandlers(service as unknown as ModelService, {
      filter: async (models) => [...models],
    });

    await handlers['/model-orders/:uniqueModelId*'].PATCH({
      body: { position: 'first' },
      params: { uniqueModelId: 'openai::org/gpt-4o' },
    });
    expect(service.reorder).toHaveBeenCalledWith('openai::org/gpt-4o', { position: 'first' });

    await handlers['/models/order:batch'].PATCH({
      body: {
        moves: [{ id: 'openai::gpt-4.1', anchor: { after: 'openai::org/gpt-4o' } }],
      },
    });
    expect(service.reorderBatch).toHaveBeenCalledWith([
      { id: 'openai::gpt-4.1', anchor: { after: 'openai::org/gpt-4o' } },
    ]);

    await expect(
      handlers['/model-orders/:uniqueModelId*'].PATCH({
        body: { after: 'not-a-unique-id' },
        params: { uniqueModelId: 'openai::gpt-4o' },
      }),
    ).rejects.toThrow();
    await expect(
      handlers['/model-orders/:uniqueModelId*'].PATCH({
        body: { position: 'first' },
        params: { uniqueModelId: 'bad-id' as never },
      }),
    ).rejects.toThrow();
    expect(service.reorder).toHaveBeenCalledTimes(1);
  });
});
