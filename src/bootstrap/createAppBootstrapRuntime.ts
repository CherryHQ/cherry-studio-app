import { DbService } from '@/backend/infrastructure/db/DbService';
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
  const dbService = new DbService();
  const services = createBackendServices(dbService);

  return {
    backend: createMobileBackend(services),
    dispose: () => {
      services.mcp.dispose();
      services.webSearch.dispose();
      dbService.dispose();
    },
    initialize: async () => {
      await dbService.init();
      await services.preference.init();
      await bootstrapAppRuntime(services);
    },
    runPostReadyTasks: () => runPostReadyTasks(services),
  };
}
