import type { PluginConnection } from '@/shared/data/types/plugin';

export type PluginConnectionSchemas = {
  '/plugin-connections': {
    GET: {
      response: PluginConnection[];
    };
  };
};
