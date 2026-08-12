import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { ResourceScopeCoordinator } from '@/backend/core/resources/ResourceScopeCoordinator';
import type { PaintingService } from '@/backend/data/services/PaintingService';

import { createPaintingHandlers } from '../paintings';

describe('painting Data API handlers', () => {
  let scopes: ResourceScopeCoordinator;

  beforeEach(async () => {
    scopes = new ResourceScopeCoordinator();
    await installTestHost({ ResourceScopeCoordinator: scopes });
  });

  afterEach(uninstallTestHost);

  test('adapt the desktop-aligned PaintingService directly', async () => {
    const service = {
      deleteMany: jest.fn(async () => undefined),
      getById: jest.fn(async () => ({ id: 'painting-1' })),
      listAllIds: jest.fn(async () => ['painting-1']),
      listByCursor: jest.fn(async () => ({ items: [] })),
    };
    const handlers = createPaintingHandlers(service as unknown as PaintingService);

    await handlers['/paintings'].DELETE({ query: { ids: ['painting-1'] } });
    await handlers['/paintings'].GET({ query: { cursor: 'cursor-1', limit: 10 } });
    await handlers['/paintings/ids'].GET({});
    await handlers['/paintings/:id'].GET({ params: { id: 'painting-1' } });

    expect(service.deleteMany).toHaveBeenCalledWith(['painting-1']);
    expect(service.listByCursor).toHaveBeenCalledWith({ cursor: 'cursor-1', limit: 10 });
    expect(service.listAllIds).toHaveBeenCalledTimes(1);
    expect(service.getById).toHaveBeenCalledWith('painting-1');
  });
});
