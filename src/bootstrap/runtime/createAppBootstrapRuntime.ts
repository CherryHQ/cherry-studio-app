import { Uniwind } from 'uniwind';

import type { MobileAgentHost } from '@/backend/ai/agent/host/MobileAgentHost';
import type { AiService } from '@/backend/ai/AiService';
import type { McpRuntimeService } from '@/backend/ai/mcp';
import type { LanguageServingSupport } from '@/backend/ai/provider/systemModelSupport';
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
import type { ProviderRegistryUpdaterService } from '@/backend/services/providers/ProviderRegistryUpdaterService';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import { createBackend } from '@/bootstrap/composition/createBackend';
import { createBackendServices } from '@/bootstrap/composition/createBackendServices';
import { initializeAppRuntime } from '@/bootstrap/runtime/initializeAppRuntime';
import AssistantActivity from '@/frontend/features/chat/AssistantActivity/AssistantActivity';
import PaintingActivity from '@/frontend/features/paintings/PaintingActivity/PaintingActivity';
import i18n from '@/frontend/i18n';
import type { Backend } from '@/shared/contracts';
import type { ApiClient } from '@/shared/data/api/types';
import type { PreferenceClient } from '@/shared/data/preference';

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
  const agent = host.container.get<MobileAgentHost>('MobileAgentHost');
  const ai = host.container.get<AiService>('AiService');
  const cache = host.container.get<CacheService>('CacheService');
  const dbService = host.container.get<DbService>('DbService');
  const jobRuntime = host.container.get<JobRuntime>('JobRuntime');
  const languageServing = host.container.get<LanguageServingSupport>('AgentRuntime');
  const mcpRuntime = host.container.get<McpRuntimeService>('McpRuntimeService');
  const preference = host.container.get<PreferenceService>('PreferenceService');
  const providerRegistryUpdater = host.container.get<ProviderRegistryUpdaterService>(
    'ProviderRegistryUpdaterService',
  );
  const webSearch = host.container.get<WebSearchService>('WebSearchService');
  const services = createBackendServices({
    agent,
    ai,
    cache,
    jobRuntime,
    mcpRuntime,
    preference,
    webSearch,
  });
  const { backend, dataApiDependencies } = createBackend(services, {
    dbService,
    languageServing,
    providerRegistryUpdater,
  });
  let disposePromise: Promise<void> | undefined;
  const dataApi = new DataApiService(
    createDataApiHandlers({
      agentAvatars: dataApiDependencies.agentAvatars,
      agents: services.agentData,
      agentToolBindings: services.agentToolBinding,
      agentSessionMessages: services.agentSessionMessage,
      agentSessionMutations: services.agent,
      agentSessions: services.agentSession,
      aiUsageRecords: services.aiUsageRecord,
      contentSearch: services.contentSearch,
      entitySearch: services.entitySearch,
      files: services.fileEntry,
      jobs: services.job,
      mcpServerMutations: dataApiDependencies.mcpServerMutations,
      mcpServers: services.mcpServer,
      models: services.model,
      paintings: services.painting,
      providers: services.provider,
      systemModelSupport: dataApiDependencies.systemModelSupport,
    }),
  );

  return {
    backend,
    dataApi,
    preference: services.preference,
    dispose: () => {
      // Nothing to drain ahead of the host: `JobRuntime` is a service, so
      // reverse-order teardown settles it before the database it writes through.
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
    },
  };
}
