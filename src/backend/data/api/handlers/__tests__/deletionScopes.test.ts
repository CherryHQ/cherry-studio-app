import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { ResourceScopeCoordinator } from '@/backend/core/resources/ResourceScopeCoordinator';
import type { PaintingService } from '@/backend/data/services/PaintingService';

import { createPaintingHandlers } from '../paintings';

describe('Data API deletion scopes', () => {
  let scopes: ResourceScopeCoordinator;
  let trace: string[];

  beforeEach(async () => {
    scopes = new ResourceScopeCoordinator();
    trace = [];
    await installTestHost({ ResourceScopeCoordinator: scopes });
  });

  afterEach(uninstallTestHost);

  it('drains active generation before deleting painting receipts', async () => {
    let finish!: () => void;
    const settled = new Promise<void>((resolve) => {
      finish = resolve;
    });
    scopes.register({
      cancel: () => {
        trace.push('cancel');
        setTimeout(() => {
          trace.push('settled');
          finish();
        }, 0);
      },
      kind: 'painting.generate',
      scopes: [{ id: 'painting-1', kind: 'painting' }],
      settled,
    });
    const service = {
      deleteMany: jest.fn(async () => {
        trace.push('deleteMany');
      }),
    } as unknown as PaintingService;

    await createPaintingHandlers(service)['/paintings'].DELETE({
      query: { ids: ['painting-1'] },
    });

    expect(trace).toEqual(['cancel', 'settled', 'deleteMany']);
  });
});
