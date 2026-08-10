import type { ModelService } from '@/backend/data/services/ModelService';

import { createModelHandlers } from '../models';

describe('model Data API handlers', () => {
  test('preserve the provider reconcile endpoint on ModelService', async () => {
    const service = {
      reconcileForProvider: jest.fn(async () => []),
    };
    const handlers = createModelHandlers(service as unknown as ModelService);
    const body = {
      toAdd: [{ modelId: 'next', providerId: 'openai' }],
      toRemove: ['openai::old' as const],
    };

    await expect(
      handlers['/providers/:providerId/models:reconcile'].POST({
        body,
        params: { providerId: 'openai' },
      }),
    ).resolves.toEqual([]);

    expect(service.reconcileForProvider).toHaveBeenCalledWith('openai', body);
  });
});
