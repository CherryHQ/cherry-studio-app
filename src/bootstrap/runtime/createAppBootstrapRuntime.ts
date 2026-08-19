import type { ApiClient } from '@cherrystudio/universal/data/api/types';
import type { PreferenceClient } from '@cherrystudio/universal/data/preference';
import { Uniwind } from 'uniwind';

import type { AiService } from '@/backend/ai/AiService';
import type { McpRuntimeService } from '@/backend/ai/mcp';
import type { ChatRuntime } from '@/backend/ai/streamManager/ChatRuntime';
import { application } from '@/backend/core/application/Application';
import { ApplicationHost, type HostProfile } from '@/backend/core/application/ApplicationHost';
import { serviceList } from '@/backend/core/application/serviceRegistry';
import { createDataApiHandlers } from '@/backend/data/api/handlers/apiHandlers';
import type { CacheService } from '@/backend/data/CacheService';
import { DataApiService } from '@/backend/data/DataApiService';
import type { DbService } from '@/backend/data/db/DbService';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { BackgroundActivityEnvironment } from '@/backend/services/backgroundActivity/BackgroundActivityEnvironment';
import { createLiveActivityPresenter } from '@/backend/services/backgroundActivity/liveActivityPresenter';
import type { JobRuntime } from '@/backend/services/jobs/JobRuntime';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import { createBackend } from '@/bootstrap/composition/createBackend';
import { createBackendServices } from '@/bootstrap/composition/createBackendServices';
import { initializeAppRuntime } from '@/bootstrap/runtime/initializeAppRuntime';
import { runPostReadyTasks } from '@/bootstrap/runtime/runPostReadyTasks';
import AssistantActivity from '@/frontend/features/chat/AssistantActivity/AssistantActivity';
import PaintingActivity from '@/frontend/features/paintings/PaintingActivity/PaintingActivity';
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

export function createAppBootstrapRuntime(
  /** Test seam. Overridden services are supplied ready-made and receive no lifecycle callbacks. */
  overrides?: HostProfile['overrides'],
): AppBootstrapRuntime {
  // Resolved straight from the host's container rather than through
  // `application.get()`: the React provider reads `backend`/`dataApi` during
  // render, so the graph has to be assembled before `install()` can run. Both
  // resolutions only construct — the connection opens in `DbService.onInit`,
  // inside `start()`.
  const host = new ApplicationHost({ overrides, services: serviceList });
  const backgroundActivityEnvironment = host.container.get<BackgroundActivityEnvironment>(
    'BackgroundActivityEnvironment',
  );
  backgroundActivityEnvironment.configure({
    assistantPresenter: createLiveActivityPresenter(AssistantActivity),
    getColorScheme: () => (Uniwind.currentTheme === 'dark' ? 'dark' : 'light'),
    paintingPresenter: createLiveActivityPresenter(PaintingActivity),
    translate: (key) => i18n.t(key),
  });
  const ai = host.container.get<AiService>('AiService');
  const cache = host.container.get<CacheService>('CacheService');
  const chat = host.container.get<ChatRuntime>('ChatRuntime');
  const dbService = host.container.get<DbService>('DbService');
  const jobRuntime = host.container.get<JobRuntime>('JobRuntime');
  const mcpRuntime = host.container.get<McpRuntimeService>('McpRuntimeService');
  const preference = host.container.get<PreferenceService>('PreferenceService');
  const webSearch = host.container.get<WebSearchService>('WebSearchService');
  const services = createBackendServices({
    ai,
    cache,
    chat,
    jobRuntime,
    mcpRuntime,
    preference,
    webSearch,
  });
  const { backend, dataApiDependencies } = createBackend(services, { dbService });
  let disposePromise: Promise<void> | undefined;
  const dataApi = new DataApiService(
    createDataApiHandlers({
      aiUsageRecords: services.aiUsageRecord,
      assistants: services.assistant,
      contentSearch: services.contentSearch,
      entitySearch: services.entitySearch,
      files: services.fileEntry,
      fileRefs: services.fileRef,
      jobs: services.job,
      mcpServerMutations: dataApiDependencies.mcpServerMutations,
      mcpServers: services.mcpServer,
      messages: services.message,
      models: services.model,
      paintings: services.painting,
      pins: services.pin,
      providers: services.provider,
      temporaryChats: services.temporaryChat,
      topics: services.topic,
    }),
  );

  return {
    backend,
    dataApi,
    preference: services.preference,
    dispose: () => {
      // Nothing to drain ahead of the host any more: `ChatRuntime` and
      // `JobRuntime` are services, so reverse-order teardown settles them before
      // the database they write through.
      disposePromise ??= (async () => {
        // The expected-host check runs inside Application's serialized
        // transition, closing the replacement/dispose race. Calling the host
        // directly afterwards also covers a runtime disposed before install;
        // disposal is idempotent when Application already handled it.
        await application.uninstall(host);
        await host.dispose();
      })();
      return disposePromise;
    },
    initialize: async () => {
      // Runs the Gate phase — cache, then database, then preferences — ordered
      // by the dependency graph rather than by the order written here.
      await application.install(host);
      await initializeAppRuntime(services);
    },
    runPostReadyTasks: async () => {
      // Starts the PostReady phase alongside the hand-run tasks. Both are
      // best-effort and off the first-paint path; the host logs its own
      // failures rather than surfacing them here.
      host.runPostReady();
      await runPostReadyTasks(services);
    },
  };
}
