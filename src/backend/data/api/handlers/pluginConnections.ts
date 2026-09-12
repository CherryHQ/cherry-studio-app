import type { PluginAuthorizationService } from '@/backend/data/services/PluginAuthorizationService';
import type { PluginConnectionSchemas } from '@/shared/data/api/schemas/pluginConnections';
import type { HandlersFor } from '@/shared/data/api/types';

export function createPluginConnectionHandlers(
  service: Pick<PluginAuthorizationService, 'listConnections'>,
): HandlersFor<PluginConnectionSchemas> {
  return {
    '/plugin-connections': {
      GET: () => service.listConnections(),
    },
  };
}
