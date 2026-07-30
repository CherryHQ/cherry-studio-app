import { createDataApiHandlers } from '@/backend/data/api/handlers/apiHandlers';
import { CacheService } from '@/backend/data/CacheService';
import { DataApiService } from '@/backend/data/DataApiService';
import { DbService } from '@/backend/data/db/DbService';
import { bootstrapAppRuntime, runPostReadyTasks } from '@/bootstrap/appRuntime';
import { createBackend } from '@/bootstrap/createBackend';
import { createBackendServices } from '@/bootstrap/createBackendServices';
import type { Backend } from '@/shared/contracts';
import type { ApiClient } from '@/shared/data/api/types';
import type { PreferenceClient } from '@/shared/data/preference';

export type AppBootstrapRuntime = {
  readonly backend: Backend;
  readonly dataApi: ApiClient;
  readonly preference: PreferenceClient;
  dispose(): void;
  initialize(): Promise<void>;
  runPostReadyTasks(): Promise<void>;
};

export function createAppBootstrapRuntime(): AppBootstrapRuntime {
  const cacheService = new CacheService();
  const dbService = new DbService();
  const services = createBackendServices(dbService, cacheService);
  const { backend, dataApiDependencies } = createBackend(services);
  const dataApi = new DataApiService(
    createDataApiHandlers({
      assistants: services.assistant,
      files: services.fileEntry,
      mcpServers: dataApiDependencies.mcpServers,
      messages: services.message,
      models: dataApiDependencies.models,
      paintings: dataApiDependencies.paintings,
      pins: services.pin,
      providers: dataApiDependencies.providers,
      topics: services.topic,
    }),
  );

  return {
    backend,
    dataApi,
    preference: services.preference,
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
