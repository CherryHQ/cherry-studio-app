import type { PinService } from '@/backend/data/services/PinService';
import type { PinSchemas } from '@cherrystudio/universal/data/api/schemas/pins';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';

type PinData = Pick<PinService, 'list' | 'pin' | 'unpin'>;

export function createPinHandlers(service: PinData): HandlersFor<PinSchemas> {
  return {
    '/pins': {
      GET: ({ query }) => service.list(query.entityType),
      POST: ({ body }) => service.pin(body),
    },
    '/pins/:id': {
      DELETE: ({ params }) => service.unpin(params.id),
    },
  };
}
