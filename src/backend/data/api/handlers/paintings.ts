import { application } from '@/backend/core/application/Application';
import type { PaintingService } from '@/backend/data/services/PaintingService';
import type { PaintingSchemas } from '@/shared/data/api/schemas/paintings';
import type { HandlersFor } from '@/shared/data/api/types';

export function createPaintingHandlers(service: PaintingService): HandlersFor<PaintingSchemas> {
  return {
    '/paintings': {
      // Cancels and drains the generate jobs writing through these receipts
      // first. Until now that only happened when the frontend remembered to call
      // the cancel hook before deleting; every caller gets it here.
      DELETE: ({ query }) =>
        application.get('ResourceScopeCoordinator').delete(
          query.ids.map((id) => ({ id, kind: 'painting' })),
          () => service.deleteMany(query.ids),
        ),
      GET: ({ query }) => service.listByCursor(query),
    },
    '/paintings/ids': {
      GET: () => service.listAllIds(),
    },
    '/paintings/:id': {
      GET: ({ params }) => service.getById(params.id),
    },
  };
}
