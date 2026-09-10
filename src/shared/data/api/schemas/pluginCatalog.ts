import type { PluginCatalogEntry } from '@/shared/data/types/plugin';

export type PluginCatalogSchemas = {
  '/plugin-catalog': {
    GET: { response: PluginCatalogEntry[] };
  };
};
