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

import { getLocales } from 'expo-localization';

import type { AiService } from '@/backend/ai/AiService';
import type { McpRuntimeService } from '@/backend/ai/mcp';
import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import { agentToolBindingService } from '@/backend/data/services/AgentToolBindingService';
import { modelService } from '@/backend/data/services/ModelService';
import { providerService } from '@/backend/data/services/ProviderService';
import type { WebSearchService } from '@/backend/services/webSearch/WebSearchService';
import type { LanguageVarious } from '@/shared/data/preference';

import { managedFileResolver } from '../resources/managedFileResolver';
import type { AgentSessionStore } from '../sessionStore/AgentSessionStore';
import {
  createSystemCapabilitySource,
  type SystemCapabilitySource,
} from '../tools/builtInToolSource';
import { createAgentRuntimeToolResolver } from '../tools/runtimeTools';
import { type AgentDefinitionSource, createAgentTableDefinitionSource } from './agentDefinitions';
import { AgentSessionNaming } from './AgentSessionNaming';
import { AgentSessionUsageRecorder } from './AgentSessionUsageRecorder';
import { resolveAgentAppLanguage } from './agentSystemPrompt';
import { createAgentInferenceModelResolver } from './inferenceSnapshot';
import type { MobileAgentHostNaming, MobileAgentHostPorts } from './MobileAgentHost';

@Injectable('AgentHostDependencies')
@ServicePhase(Phase.PostReady)
@DependsOn([
  'AgentSessionStore',
  'AiService',
  'PreferenceService',
  'McpRuntimeService',
  'WebSearchService',
])
export class AgentHostDependencies extends BaseService implements MobileAgentHostPorts {
  readonly files = managedFileResolver;
  readonly inferenceModel = createAgentInferenceModelResolver(modelService);
  readonly runtimeTools;
  readonly usage = new AgentSessionUsageRecorder();

  constructor(
    private readonly store: AgentSessionStore,
    private readonly aiService: AiService,
    private readonly preferenceService: PreferenceService,
    mcpRuntime: McpRuntimeService,
    private readonly webSearchService: WebSearchService,
  ) {
    super();
    this.runtimeTools = createAgentRuntimeToolResolver({
      bindings: agentToolBindingService,
      getMcpRuntime: () => mcpRuntime,
    });
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
    return resolveAgentAppLanguage(
      this.preferenceService.readCached('app.language'),
      getLocales()[0]?.languageCode,
    );
  }

  naming(signal: AbortSignal): MobileAgentHostNaming {
    return new AgentSessionNaming({
      ai: this.aiService,
      model: modelService,
      preference: this.preferenceService,
      provider: providerService,
      signal,
      store: this.store,
    });
  }
}
