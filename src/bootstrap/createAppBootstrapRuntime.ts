import { CacheService } from '@/backend/data/CacheService';
import { DbService } from '@/backend/data/db/DbService';
import { bootstrapAppRuntime, runPostReadyTasks } from '@/bootstrap/appRuntime';
import { createBackendServices } from '@/bootstrap/createBackendServices';
import { createMobileBackend } from '@/bootstrap/createMobileBackend';
import type { MobileBackend } from '@/shared/contracts';

export type AppBootstrapRuntime = {
  readonly backend: MobileBackend;
  dispose(): void;
  initialize(): Promise<void>;
  runPostReadyTasks(): Promise<void>;
};

export function createAppBootstrapRuntime(): AppBootstrapRuntime {
  const cacheService = new CacheService();
  const dbService = new DbService();
  const services = createBackendServices(dbService, cacheService);

  return {
    backend: createMobileBackend(services),
    dispose: () => {
      services.mcpRuntime.dispose();
      services.webSearch.dispose();
      services.cache.dispose();
      dbService.dispose();
    },
    initialize: async () => {
      services.cache.init();
      await dbService.init(services.cache);
      await services.preference.init();
      await bootstrapAppRuntime(services);
    },
    runPostReadyTasks: () => runPostReadyTasks(services),
  };
}
