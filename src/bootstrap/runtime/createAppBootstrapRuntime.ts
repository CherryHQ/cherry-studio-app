import type { ApiClient } from '@cherrystudio/universal/data/api/types';
import type { PreferenceClient } from '@cherrystudio/universal/data/preference';

import { createDataApiHandlers } from '@/backend/data/api/handlers/apiHandlers';
import { CacheService } from '@/backend/data/CacheService';
import { DataApiService } from '@/backend/data/DataApiService';
import { DbService } from '@/backend/data/db/DbService';
import { createBackend } from '@/bootstrap/composition/createBackend';
import { createBackendServices } from '@/bootstrap/composition/createBackendServices';
import { initializeAppRuntime } from '@/bootstrap/runtime/initializeAppRuntime';
import { runPostReadyTasks } from '@/bootstrap/runtime/runPostReadyTasks';
import AssistantActivity from '@/frontend/features/chat/background/AssistantActivity';
import PaintingActivity from '@/frontend/features/paintings/background/PaintingActivity';
import i18n from '@/frontend/i18n';
import type { Backend } from '@/shared/contracts';

export type AppBootstrapRuntime = {
  readonly backend: Backend;
  readonly dataApi: ApiClient;
  readonly preference: PreferenceClient;
  dispose(): Promise<void>;
  initialize(): Promise<void>;
  runPostReadyTasks(): Promise<void>;
};

export function createAppBootstrapRuntime(): AppBootstrapRuntime {
  const cacheService = new CacheService();
  const dbService = new DbService();
  const services = createBackendServices(dbService, cacheService);
  const {
    backend,
    dataApiDependencies,
    dispose: disposeBackend,
    jobRuntime,
  } = createBackend(services, {
    activities: { assistantActivity: AssistantActivity, paintingActivity: PaintingActivity },
    dbService,
    translate: (key) => i18n.t(key),
  });
  let disposePromise: Promise<void> | undefined;
  const dataApi = new DataApiService(
    createDataApiHandlers({
      agentChannels: services.agentChannel,
      agentGlobalSkills: services.agentGlobalSkill,
      agents: services.agent,
      agentSessionMessages: services.agentSessionMessage,
      agentSessions: services.agentSession,
      agentTasks: services.agentTask,
      agentWorkspaces: services.agentWorkspace,
      aiUsageRecords: services.aiUsageRecord,
      assistants: services.assistant,
      contentSearch: services.contentSearch,
      entitySearch: services.entitySearch,
      files: services.fileEntry,
      fileRefs: services.fileRef,
      groups: services.group,
      jobs: services.job,
      knowledgeBases: services.knowledgeBase,
      knowledgeItems: services.knowledgeItem,
      mcpServerMutations: dataApiDependencies.mcpServerMutations,
      mcpServers: services.mcpServer,
      messages: services.message,
      miniApps: services.miniApp,
      models: services.model,
      notes: services.note,
      onTopicsDeleted: dataApiDependencies.onTopicsDeleted,
      paintings: services.painting,
      pins: services.pin,
      prompts: services.prompt,
      providers: services.provider,
      tags: services.tag,
      temporaryChats: services.temporaryChat,
      topics: services.topic,
      translateHistories: services.translateHistory,
      translateLanguages: services.translateLanguage,
    }),
  );

  return {
    backend,
    dataApi,
    preference: services.preference,
    dispose: () => {
      disposePromise ??= (async () => {
        await disposeBackend();
        services.mcpRuntime.dispose();
        services.webSearch.dispose();
        services.cache.dispose();
        dbService.dispose();
      })();
      return disposePromise;
    },
    initialize: async () => {
      services.cache.init();
      await dbService.init(services.cache);
      await services.preference.init();
      await initializeAppRuntime(services);
    },
    runPostReadyTasks: () => runPostReadyTasks(services, { jobRuntime }),
  };
}
