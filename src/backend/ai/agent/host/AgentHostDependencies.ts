/**
 * Assembles the Mobile Agent Host's ports from application services.
 *
 * The Host itself depends only on `MobileAgentHostPorts`; this service is the
 * one place that knows which concrete data services, capability adapters, and
 * lifecycle-managed runtimes stand behind those ports. Replacing any
 * collaborator is a change here, never in the Host. The Host declares this
 * service as a dependency, so every owner listed below still stops after the
 * Host has drained its turns.
 */

import { fromByteArray } from 'base64-js';
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import type { AiService } from '@/backend/ai/AiService';
import type { McpRuntimeService } from '@/backend/ai/mcp';
import type { TraceRecorder } from '@/backend/ai/observability';
import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import { AgentSqlDatabase } from '@/backend/data/db/AgentSqlDatabase';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { agentGlobalSkillService } from '@/backend/data/services/AgentGlobalSkillService';
import { agentToolBindingService } from '@/backend/data/services/AgentToolBindingService';
import { aiUsageRecordService } from '@/backend/data/services/AiUsageRecordService';
import { fileEntryService } from '@/backend/data/services/FileEntryService';
import { mcpServerService } from '@/backend/data/services/McpServerService';
import { modelService } from '@/backend/data/services/ModelService';
import { providerService } from '@/backend/data/services/ProviderService';
import { createInternalEntryWithPreview } from '@/backend/services/file/filePreviewStorage';
import { createInternalEntry, discardInternalEntries } from '@/backend/services/file/fileStorage';
import { createJsSandbox } from '@/backend/services/jsSandbox';
import type { KeepAliveSource } from '@/backend/services/keepAlive/KeepAliveCoordinator';
import { skillStorage } from '@/backend/services/skill';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import type { DocumentParserMode } from '@/shared/contracts/fileAttachment';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { LanguageVarious } from '@/shared/data/preference';
import { imageMediaTypeFromExtension } from '@/shared/utils/imageFileTypes';
import { resolveAppLanguage } from '@/shared/utils/languages';

import { managedFileResolver } from '../resources/managedFileResolver';
import type { RuntimeTextGenerator, RuntimeWebTools } from '../runtime';
import type { AgentSessionStore } from '../sessionStore/AgentSessionStore';
import {
  createSystemCapabilitySource,
  type SystemCapabilitySource,
} from '../tools/builtInToolSource';
import { createAgentRuntimeToolResolver } from '../tools/runtimeTools';
import { type AgentDefinitionSource, createAgentTableDefinitionSource } from './agentDefinitions';
import { createAgentImageGeneration } from './agentImageGeneration';
import { AgentSessionNaming } from './AgentSessionNaming';
import { AgentSessionUsageRecorder } from './AgentSessionUsageRecorder';
import { createAgentInferenceModelResolver } from './inferenceSnapshot';
import type { MobileAgentHostNaming, MobileAgentHostPorts } from './MobileAgentHost';
import { createSkillScopeSource } from './skillScope';

const LEGACY_REPLAY_CACHE_ID = 'cherry-agent-replay-cache';
const logger = loggerService.withContext('AgentHostDependencies');

@Injectable('AgentHostDependencies')
@ServicePhase(Phase.PostReady)
@DependsOn([
  'AgentSessionStore',
  'AiService',
  'PreferenceService',
  'McpRuntimeService',
  'WebSearchService',
  'TraceStorageService',
  'AgentRuntime',
  'KeepAliveCoordinator',
])
export class AgentHostDependencies extends BaseService implements MobileAgentHostPorts {
  scriptSandbox() {
    const native = createJsSandbox();
    return native?.startBridge
      ? {
          fingerprint: `${Platform.OS} ${Platform.Version}`,
          startBridge: native.startBridge,
        }
      : undefined;
  }
  readonly writeToolOutput: NonNullable<MobileAgentHostPorts['writeToolOutput']> = async (
    { name, data, folderId },
    signal,
  ) => {
    const entry = await createInternalEntry(
      fileEntryService,
      {
        source: typeof data === 'string' ? 'text' : 'base64',
        data: typeof data === 'string' ? data : fromByteArray(data),
        name,
        mediaType:
          typeof data === 'string'
            ? 'text/plain'
            : imageMediaTypeFromExtension(name.split('.').at(-1)),
        provenance: 'generated',
        folderId,
      },
      signal,
    );
    return {
      ref: { kind: 'managed-file', fileEntryId: entry.id },
      name: entry.filename,
      mediaType: entry.mediaType,
      kind: 'created',
    };
  };
  readonly files = managedFileResolver;
  readonly inferenceModel = createAgentInferenceModelResolver(modelService);
  readonly runtimeTools;
  readonly skills;
  readonly imageGeneration;
  readonly usage = new AgentSessionUsageRecorder();
  readonly executionLease = (onInterrupt: (reason: Error) => void | Promise<void>) =>
    this.keepAlive.acquire('agent.durable', onInterrupt);
  readonly durableStorage = {
    open: () => AgentSqlDatabase.open(),
    notifyTranscript: (sessionId: string) =>
      publishDataApiChanges([
        '/agent-sessions',
        `/agent-sessions/${sessionId}`,
        `/agent-sessions/${sessionId}/messages`,
      ]),
  };
  readonly recordDurableUsage: NonNullable<MobileAgentHostPorts['recordDurableUsage']> = async (
    _owner,
    report,
    attribution,
  ) => {
    await aiUsageRecordService.recordInvocation({
      completedAt: report.completedAt,
      metrics: report.metrics,
      context: {
        ...report.context,
        source: { type: 'agent', id: attribution.agentId, name: attribution.agentName, icon: null },
        messageRef: attribution.assistantMessageId
          ? { kind: 'agent-session', id: attribution.assistantMessageId }
          : null,
      },
      modality: 'language',
      requestId: report.requestId,
      usage: report.usage,
    });
  };
  constructor(
    private readonly store: AgentSessionStore,
    private readonly aiService: AiService,
    private readonly preferenceService: PreferenceService,
    mcpRuntime: McpRuntimeService,
    private readonly webSearchService: WebSearchService,
    readonly traces: TraceRecorder,
    private readonly textGenerator: RuntimeTextGenerator,
    private readonly keepAlive: KeepAliveSource = { acquire: () => ({ release() {} }) },
  ) {
    super();
    this.imageGeneration = createAgentImageGeneration({
      ai: aiService,
      models: modelService,
      files: this.files,
      storage: {
        createInternalEntry: (input) => createInternalEntryWithPreview(fileEntryService, input),
        discard: (entries) => discardInternalEntries(fileEntryService, entries),
      },
    });
    this.runtimeTools = createAgentRuntimeToolResolver({
      bindings: agentToolBindingService,
      servers: mcpServerService,
      getMcpRuntime: () => mcpRuntime,
    });
    this.skills = createSkillScopeSource({
      skills: agentGlobalSkillService,
      storage: skillStorage,
    });
  }

  /** Releases before Pi Durable cached per-turn model replay in MMKV; nothing reads it now. */
  protected override onReady() {
    createMMKV({ id: LEGACY_REPLAY_CACHE_ID }).clearAll();
  }

  // Resolved on first use: both sources read the database, which is not a
  // construction-time concern for a PostReady service.
  private lazyAgents: AgentDefinitionSource | undefined;
  private lazyTools: SystemCapabilitySource | undefined;

  get agents(): AgentDefinitionSource {
    return (this.lazyAgents ??= createAgentTableDefinitionSource());
  }

  get tools(): SystemCapabilitySource {
    return (this.lazyTools ??= createSystemCapabilitySource({
      ai: this.aiService,
      model: modelService,
      preference: this.preferenceService,
      webSearch: this.webSearchService,
    }));
  }

  appLanguage(): LanguageVarious {
    return resolveAppLanguage(
      this.preferenceService.readCached('app.language'),
      getLocales().map((locale) => locale.languageTag),
    );
  }

  documentParserMode(): DocumentParserMode {
    return this.preferenceService.readCached('file.document_parser.mode');
  }

  async webTools(): Promise<RuntimeWebTools> {
    const [clientSearchAvailable, clientFetchAvailable] = await Promise.all([
      this.webSearchService.isConfigured('searchKeywords'),
      this.webSearchService.isConfigured('fetchUrls'),
    ]);
    return {
      modelToolsPreferred: this.preferenceService.readCached(
        'chat.web_search.model_tools_preferred',
      ),
      clientSearchAvailable,
      clientFetchAvailable,
    };
  }

  naming(signal: AbortSignal): MobileAgentHostNaming {
    return new AgentSessionNaming({
      ai: this.textGenerator,
      appLanguage: () => this.appLanguage(),
      model: modelService,
      onUsage: async (report) => {
        try {
          await aiUsageRecordService.recordInvocation({
            ...report,
            context: { ...report.context, source: null, messageRef: null },
            modality: 'language',
          });
        } catch {
          logger.warn('Failed to record session naming usage');
        }
      },
      preference: this.preferenceService,
      provider: providerService,
      signal,
      store: this.store,
    });
  }
}
