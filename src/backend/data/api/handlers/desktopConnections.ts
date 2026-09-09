import type { DesktopConnectionService } from '@/backend/data/services/DesktopConnectionService';
import type { DesktopConnectionSchemas } from '@/shared/data/api/schemas/desktopConnections';
import type { HandlersFor } from '@/shared/data/api/types';

export function createDesktopConnectionHandlers(
  service: DesktopConnectionService,
): HandlersFor<DesktopConnectionSchemas> {
  return {
    '/desktop-connections': {
      GET: () => service.list(),
    },
    '/desktop-connections/:id': {
      GET: ({ params }) => service.getById(params.id),
    },
  };
}
