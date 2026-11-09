import type { DesktopConnectionService } from '@/backend/data/services/DesktopConnectionService';
import type { DesktopConnectionSchemas } from '@/shared/data/api/schemas/desktopConnections';
import type { HandlersFor } from '@/shared/data/api/types';

export function createDesktopConnectionHandlers(
  service: DesktopConnectionService,
  endpointsChanged: (id: string) => Promise<void>,
  nameChanged: (id: string) => Promise<void>,
): HandlersFor<DesktopConnectionSchemas> {
  return {
    '/desktop-connections': {
      GET: () => service.list(),
    },
    '/desktop-connections/:id': {
      GET: ({ params }) => service.getById(params.id),
      PATCH: async ({ params, body }) => {
        const connection = await service.update(params.id, body);
        if (body.alias !== undefined) await nameChanged(params.id);
        if (body.configuredEndpoints !== undefined) await endpointsChanged(params.id);
        return connection;
      },
    },
  };
}
