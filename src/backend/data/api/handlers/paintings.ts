import type { PaintingSchemas } from '@cherrystudio/universal/data/api/schemas/paintings';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';

import type { PaintingService } from '@/backend/data/services/PaintingService';

export function createPaintingHandlers(service: PaintingService): HandlersFor<PaintingSchemas> {
  return {
    '/paintings': {
      DELETE: ({ query }) => service.deleteMany(query.ids),
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
