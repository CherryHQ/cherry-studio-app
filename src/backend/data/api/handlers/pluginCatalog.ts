import type { PluginCatalogSchemas } from '@/shared/data/api/schemas/pluginCatalog';
import type { HandlersFor } from '@/shared/data/api/types';
import type { PluginCatalogEntry } from '@/shared/data/types/plugin';

export type PluginCatalogReader = () => PluginCatalogEntry[];

export function createPluginCatalogHandlers(
  readCatalog: PluginCatalogReader,
): HandlersFor<PluginCatalogSchemas> {
  return { '/plugin-catalog': { GET: async () => readCatalog() } };
}
