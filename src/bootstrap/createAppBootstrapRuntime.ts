import { createDataApiHandlers } from '@/backend/data/api/handlers/apiHandlers';
import { CacheService } from '@/backend/data/CacheService';
import { DataApiService } from '@/backend/data/DataApiService';
import { DbService } from '@/backend/data/db/DbService';
import { bootstrapAppRuntime, runPostReadyTasks } from '@/bootstrap/appRuntime';
import { createBackendServices } from '@/bootstrap/createBackendServices';
import { createMobileBackend } from '@/bootstrap/createMobileBackend';
import type { MobileBackend } from '@/shared/contracts';
import type { ApiClient } from '@/shared/data/api/types';

export type AppBootstrapRuntime = {
  readonly backend: MobileBackend;
  readonly dataApi: ApiClient;
  dispose(): void;
  initialize(): Promise<void>;
  runPostReadyTasks(): Promise<void>;
};

export function createAppBootstrapRuntime(): AppBootstrapRuntime {
  const cacheService = new CacheService();
  const dbService = new DbService();
  const services = createBackendServices(dbService, cacheService);
  const backend = createMobileBackend(services);
  const dataApi = new DataApiService(
    createDataApiHandlers({
      assistants: services.assistant,
      files: services.fileEntry,
      mcpServers: backend.mcp,
      messages: services.message,
      models: backend.models,
      paintings: backend.paintings,
      pins: services.pin,
      providers: backend.providers,
      topics: services.topic,
    }),
  );

  return {
    backend,
    dataApi,
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
