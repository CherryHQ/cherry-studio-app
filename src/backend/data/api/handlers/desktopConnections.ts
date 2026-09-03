import type { DesktopConnectionService } from '@/backend/data/services/DesktopConnectionService';
import type { DesktopConnectionSchemas } from '@/shared/data/api/schemas/desktopConnections';
import type { HandlersFor } from '@/shared/data/api/types';

export function createDesktopConnectionHandlers(
  service: DesktopConnectionService,
): HandlersFor<DesktopConnectionSchemas> {
  return {
    '/desktop-connections': {
      GET: () => service.list(),
      POST: ({ body }) => service.pair(body),
    },
    '/desktop-connections/:id': {
      DELETE: ({ params }) => service.remove(params.id),
      GET: ({ params }) => service.getById(params.id),
    },
    '/desktop-connections/:id/import': {
      POST: ({ body, params }) => service.import(params.id, body),
    },
    '/desktop-connections/:id/preview': {
      POST: ({ params }) => service.preview(params.id),
    },
  };
}
