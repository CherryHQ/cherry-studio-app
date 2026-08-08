import type { CacheService } from '@/backend/data/CacheService';
import type { DbService } from '@/backend/data/db/DbService';

import { createAiServices } from './createAiServices';
import { createDataServices } from './createDataServices';
import { createPlatformAdapters } from './createPlatformAdapters';

export type BackendServices = ReturnType<typeof createBackendServices>;

export function createBackendServices(dbService: DbService, cache: CacheService) {
  const dataServices = createDataServices({ cache, dbService });
  const platformAdapters = createPlatformAdapters({
    fileEntry: dataServices.fileEntry,
    fileRef: dataServices.fileRef,
  });
  const aiServices = createAiServices({
    aiUsageRecord: dataServices.aiUsageRecord,
    assistant: dataServices.assistant,
    devicePermissions: platformAdapters.devicePermissions,
    fileContent: platformAdapters.fileContent,
    mcpServer: dataServices.mcpServer,
    model: dataServices.model,
    preference: dataServices.preference,
    provider: dataServices.provider,
  });

  return {
    ...dataServices,
    ...platformAdapters,
    ...aiServices,
  };
}
