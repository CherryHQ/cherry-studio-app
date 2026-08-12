import type { ApiClient } from '@cherrystudio/universal/data/api/types';
import type { PreferenceClient } from '@cherrystudio/universal/data/preference';

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
import type { JobRuntime } from '@/backend/services/jobs/JobRuntime';
import type { ProviderOAuthService } from '@/backend/services/oauth/authorization/ProviderOAuthService';
import type { OAuthRuntimeService } from '@/backend/services/oauth/runtime/OAuthRuntimeService';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import { createBackend } from '@/bootstrap/composition/createBackend';
import { createBackendServices } from '@/bootstrap/composition/createBackendServices';
import { initializeAppRuntime } from '@/bootstrap/runtime/initializeAppRuntime';
import { runPostReadyTasks } from '@/bootstrap/runtime/runPostReadyTasks';
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
  const ai = host.container.get<AiService>('AiService');
  const cache = host.container.get<CacheService>('CacheService');
  const chat = host.container.get<ChatRuntime>('ChatRuntime');
  const dbService = host.container.get<DbService>('DbService');
  const jobRuntime = host.container.get<JobRuntime>('JobRuntime');
  const mcpRuntime = host.container.get<McpRuntimeService>('McpRuntimeService');
  const oauth = host.container.get<ProviderOAuthService>('ProviderOAuthService');
  const oauthSession = host.container.get<OAuthRuntimeService>('OAuthRuntimeService');
  const preference = host.container.get<PreferenceService>('PreferenceService');
  const webSearch = host.container.get<WebSearchService>('WebSearchService');
  const services = createBackendServices({
    ai,
    cache,
    chat,
    jobRuntime,
    mcpRuntime,
    oauth,
    oauthSession,
    preference,
    webSearch,
  });
  const { backend, dataApiDependencies } = createBackend(services, { dbService });
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
      // Nothing to drain ahead of the host any more: `ChatRuntime` and
      // `JobRuntime` are services, so reverse-order teardown settles them before
      // the database they write through. Uninstalling is only correct while this
      // is still the installed host — a runtime disposed out of order must not
      // take down whichever host replaced it.
      disposePromise ??= (async () => {
        if (application.current === host) {
          await application.uninstall();
        } else {
          await host.dispose();
        }
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
