import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { AiPlugin } from '@cherrystudio/ai-core';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { ServingCredentialReceipt } from '@cherrystudio/universal/data/types/aiUsageRecord';
import {
  type Assistant,
  DEFAULT_ASSISTANT_SETTINGS,
} from '@cherrystudio/universal/data/types/assistant';
import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { isAnthropicModel, isFunctionCallingModel } from '@cherrystudio/universal/utils/model';
import { type ToolCallRepairFunction, type ToolSet } from 'ai';
import * as Crypto from 'expo-crypto';

import type { PreferenceService } from '@/backend/data/PreferenceService';
import {
  projectRuntimeReasoning,
  providerRegistryService,
} from '@/backend/data/services/ProviderRegistryService';
import type { ProviderService } from '@/backend/data/services/ProviderService';

import { resolveProviderAiSdkConfig } from '../../../provider/config';
import {
  resolveAiSdkProviderId,
  resolveEffectiveEndpoint,
  resolveProviderOptionsKey,
} from '../../../provider/endpoint';
import type { ToolResolver } from '../../../tools';
import { TOOL_SEARCH_TOOL_NAME } from '../../../tools/adapters/aiSdk/meta/toolSearch';
import { createAiRepair } from '../../../tools/adapters/aiSdk/repair';
import type { RequestContext } from '../../../tools/adapters/aiSdk/types';
import type { ProviderConfig } from '../../../types';
import type { AiBaseRequest, CallOverrides } from '../../../types/requests';
import { addAnthropicHeaders } from '../../../utils/anthropicHeaders';
import {
  filterStandardParams,
  getMaxTokens,
  getTemperature,
  getTimeout,
  getTopP,
} from '../../../utils/modelParameters';
import {
  applyFastModeToProviderOptions,
  buildCapabilityProviderOptions,
  buildResolvedReasoningProviderOptions,
  extractAiSdkStandardParams,
  mergeCustomProviderParameters,
} from '../../../utils/options';
import { replacePromptVariables } from '../../../utils/promptVariables';
import { getCustomParameters } from '../../../utils/reasoning';
import {
  resolveReasoningInvocation,
  type ResolvedReasoningInvocation,
} from '../../../utils/reasoningSerializers';
import type { AgentOptions } from '../Agent';
import {
  createToolCallLimitStopCondition,
  stopOnTerminalToolFailure,
  trackSteerYieldStopCondition,
} from '../loop/toolLoopTermination';
import { CITATIONS_SYSTEM_PROMPT } from '../prompts/citations';
import { getDeferredToolsSystemPrompt } from '../prompts/deferredTools';
import { buildAgentPlugins } from './buildAgentPlugins';
import { resolveCapabilities } from './capabilities';
import { type NativeFileSupport, resolveNativeFileSupport } from './nativeFileSupport';

export interface BuildAgentParamsDependencies {
  preference: PreferenceService;
  provider: Pick<ProviderService, 'getAuthConfig' | 'resolveApiKey'>;
  tools: Pick<ToolResolver, 'resolveForRequest'>;
}

export interface BuildAgentParamsInput {
  request: AiBaseRequest & { apiKeyOverride?: string; chatId?: string; messageId?: string };
  services: BuildAgentParamsDependencies;
  provider: Provider;
  model: Model;
  assistant?: Assistant;
  shouldIncludeExternalTools?: boolean;
  /** Late-bound usage middleware for nested tool-repair calls. */
  getRepairUsagePlugins?: () => AiPlugin[];
}

export interface BuiltAgentParams {
  sdkConfig: ProviderConfig & { modelId: string };
  nativeFileSupport: NativeFileSupport;
  context: RequestContext;
  system: string | undefined;
  plugins: AiPlugin[];
  repairToolCall: ToolCallRepairFunction<ToolSet>;
  tools: ToolSet | undefined;
  options: AgentOptions;
  credentialReceipt: ServingCredentialReceipt;
}

export async function buildAgentParams({
  request,
  services,
  provider,
  model,
  assistant,
  shouldIncludeExternalTools = false,
  getRepairUsagePlugins,
}: BuildAgentParamsInput): Promise<BuiltAgentParams> {
  const resolvedEndpoint = resolveEffectiveEndpoint(provider, model);
  const { config: sdkConfig, credentialReceipt } = await resolveProviderAiSdkConfig(
    provider,
    model,
    {
      getAuthConfig: (providerId) => services.provider.getAuthConfig(providerId),
      resolveApiKey: (providerId, override) =>
        services.provider.resolveApiKey(providerId, override),
    },
    { apiKeyOverride: request.apiKeyOverride, resolvedEndpoint },
  );
  const endpointType = resolvedEndpoint.endpointType;
  const aiSdkProviderId = resolveAiSdkProviderId(provider, endpointType);
  const nativeFileSupport = resolveNativeFileSupport(provider, model, aiSdkProviderId);
  const providerOptionsKey = resolveProviderOptionsKey(sdkConfig.providerId, {
    actualProviderId: provider.id,
    endpointType,
    gatewayProviderOptionsKey: resolvedEndpoint.providerOptionsKey,
  });
  const reasoningEndpointType =
    sdkConfig.providerId === 'google-vertex-maas'
      ? ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS
      : endpointType;
  const reasoningProfile = providerRegistryService.resolveReasoningProfile(
    provider,
    model,
    reasoningEndpointType,
  );
  const invocationModel = reasoningProfile.support
    ? {
        ...model,
        reasoning: projectRuntimeReasoning(reasoningProfile.support, reasoningProfile.wire),
      }
    : model;
  const reasoning = resolveReasoningInvocation({
    selection: request.reasoningEffort ?? assistant?.settings.reasoning_effort ?? 'default',
    model: invocationModel,
    profile: reasoningProfile.wire,
    maxTokens: resolveReasoningMaxTokens(request.callOverrides?.maxOutputTokens, assistant, model),
    assistantSummary:
      typeof provider.settings.summaryText === 'string' ? provider.settings.summaryText : undefined,
  });
  const capabilities = assistant
    ? resolveCapabilities(model, provider, assistant, aiSdkProviderId, services.preference)
    : undefined;
  let providerOptions =
    assistant && capabilities
      ? buildCapabilityProviderOptions(assistant, model, provider, capabilities, {
          aiSdkProviderId,
          runtimeProviderId: sdkConfig.providerId,
          providerOptionsKey,
          endpointType,
          reasoning,
        })
      : request.reasoningEffort !== undefined
        ? buildResolvedReasoningProviderOptions({
            aiSdkProviderId: sdkConfig.providerId,
            providerOptionsKey,
            endpointType,
            reasoning,
          })
        : {};
  const standardParams = assistant
    ? getAssistantStandardParams(assistant, model, provider, reasoning)
    : {};
  const customParams = assistant ? getCustomParameters(assistant) : {};
  const split = extractAiSdkStandardParams(customParams);
  const filteredStandardParams = filterStandardParams(split.standardParams, model);
  providerOptions = mergeCustomProviderParameters(
    providerOptions,
    split.providerParams,
    provider.id,
    sdkConfig.providerId === 'google-vertex-maas' ? 'openai-compatible' : aiSdkProviderId,
  );
  const anthropicBetaHeaders =
    assistant && isAnthropicModel(model) ? addAnthropicHeaders(assistant, model, provider) : [];
  const headers =
    request.requestOptions?.headers || anthropicBetaHeaders.length > 0
      ? {
          ...request.requestOptions?.headers,
          ...(anthropicBetaHeaders.length > 0 && {
            'anthropic-beta': anthropicBetaHeaders.join(','),
          }),
        }
      : undefined;
  const shouldLoadTools = shouldIncludeExternalTools && assistant && isFunctionCallingModel(model);
  const resolvedTools = shouldLoadTools
    ? await services.tools.resolveForRequest({
        assistant,
        contextWindow: model.contextWindow,
        mcpToolIds: request.mcpToolIds,
      })
    : { deferredEntries: [], hasMcpTools: false, tools: undefined };
  const plugins = buildAgentPlugins({
    aiSdkProviderId: sdkConfig.providerId,
    assistant,
    endpointType,
    hasMcpTools: resolvedTools.hasMcpTools,
    hasReasoningSelectionSource: Boolean(assistant) || request.reasoningEffort !== undefined,
    model,
    provider,
    reasoning,
    streamOutput: capabilities?.streamOutput ?? true,
    webSearchPluginConfig: capabilities?.webSearchPluginConfig,
  });
  const tools = mergeToolSets(resolvedTools.tools, request.callOverrides?.tools);
  const baseSystem = assistant?.prompt
    ? await replacePromptVariables(assistant.prompt, model.name, services.preference)
    : undefined;
  const deferredSystem =
    tools && TOOL_SEARCH_TOOL_NAME in tools
      ? getDeferredToolsSystemPrompt(resolvedTools.deferredEntries)
      : undefined;
  const hasCitableTools = Boolean(
    tools?.web_search ||
    tools?.web_fetch ||
    resolvedTools.deferredEntries.some(
      (entry) => entry.name === 'web_search' || entry.name === 'web_fetch',
    ),
  );
  const system =
    [baseSystem, deferredSystem, hasCitableTools && CITATIONS_SYSTEM_PROMPT]
      .filter(Boolean)
      .join('\n\n') || undefined;
  const context: RequestContext = {
    abortSignal: request.requestOptions?.signal,
    assistant,
    chatId: request.chatId,
    requestId:
      'messageId' in request && typeof request.messageId === 'string'
        ? request.messageId
        : Crypto.randomUUID(),
  };
  const repairToolCall = createAiRepair({
    modelId: model.apiModelId ?? model.modelId,
    providerId: sdkConfig.providerId,
    providerSettings: sdkConfig.providerSettings,
    getUsagePlugins: getRepairUsagePlugins,
  });
  const overridden = applyCallOverrides(
    {
      providerOptions,
      standardParams: { ...standardParams, ...filteredStandardParams },
    },
    request.callOverrides,
    model,
  );
  const effectiveProviderOptions = applyFastModeToProviderOptions(
    provider,
    model,
    overridden.providerOptions,
    request.fastMode === true,
  );
  const stopWhen = [
    ...(tools
      ? [
          createToolCallLimitStopCondition(
            assistant?.settings.enableMaxToolCalls ? assistant.settings.maxToolCalls : 20,
          ),
          stopOnTerminalToolFailure,
        ]
      : []),
    ...(request.shouldYield
      ? [trackSteerYieldStopCondition(() => request.shouldYield?.() === true)]
      : []),
  ];

  return {
    credentialReceipt,
    sdkConfig: { ...sdkConfig, modelId: model.apiModelId ?? model.modelId },
    nativeFileSupport,
    context,
    system,
    plugins,
    repairToolCall,
    tools,
    options: {
      maxRetries: request.requestOptions?.maxRetries ?? 0,
      timeout: request.requestOptions?.timeout ?? getTimeout(model),
      ...(headers && { headers }),
      ...(request.callOverrides?.toolChoice && {
        toolChoice: request.callOverrides.toolChoice,
      }),
      ...(Object.keys(effectiveProviderOptions).length > 0 && {
        providerOptions: effectiveProviderOptions,
      }),
      ...overridden.standardParams,
      ...(stopWhen.length > 0 && { stopWhen }),
    },
  };
}

function mergeToolSets(
  base: ToolSet | undefined,
  overrides: ToolSet | undefined,
): ToolSet | undefined {
  if (!overrides || Object.keys(overrides).length === 0) return base;
  return { ...base, ...overrides };
}

export function applyCallOverrides(
  base: {
    providerOptions: ProviderOptions;
    standardParams: Partial<Record<string, unknown>>;
  },
  callOverrides: CallOverrides | undefined,
  model: Model,
): {
  providerOptions: ProviderOptions;
  standardParams: Partial<Record<string, unknown>>;
} {
  if (!callOverrides) return base;

  const sampling: Partial<Record<string, unknown>> = {};
  if (callOverrides.temperature !== undefined) sampling.temperature = callOverrides.temperature;
  if (callOverrides.maxOutputTokens !== undefined) {
    sampling.maxOutputTokens = callOverrides.maxOutputTokens;
  }
  if (callOverrides.topP !== undefined) sampling.topP = callOverrides.topP;
  if (callOverrides.topK !== undefined) sampling.topK = callOverrides.topK;
  if (callOverrides.stopSequences !== undefined) {
    sampling.stopSequences = callOverrides.stopSequences;
  }
  const standardParams = {
    ...base.standardParams,
    ...filterStandardParams(sampling, model),
  };

  let providerOptions = base.providerOptions;
  if (callOverrides.providerOptions) {
    providerOptions = { ...providerOptions };
    for (const [providerId, options] of Object.entries(callOverrides.providerOptions)) {
      providerOptions[providerId] = {
        ...providerOptions[providerId],
        ...options,
      };
    }
  }

  return { providerOptions, standardParams };
}

function getAssistantStandardParams(
  assistant: Assistant,
  model: Model,
  provider: Provider,
  reasoning: ResolvedReasoningInvocation,
): Record<string, number> {
  const params: Record<string, number> = {};
  const temperature = getTemperature(assistant, model, reasoning);
  const topP = getTopP(assistant, model, reasoning);
  const maxOutputTokens = getMaxTokens(assistant, model, provider, reasoning);

  if (temperature !== undefined) params.temperature = temperature;
  if (topP !== undefined) params.topP = topP;
  if (maxOutputTokens !== undefined) params.maxOutputTokens = maxOutputTokens;

  return params;
}

export function resolveReasoningMaxTokens(
  requestMaxOutputTokens: number | undefined,
  assistant: Assistant | undefined,
  model: Model,
): number | undefined {
  if (requestMaxOutputTokens !== undefined) return requestMaxOutputTokens;

  const enableMaxTokens =
    assistant?.settings.enableMaxTokens ?? DEFAULT_ASSISTANT_SETTINGS.enableMaxTokens;
  if (enableMaxTokens) {
    return assistant?.settings.maxTokens ?? DEFAULT_ASSISTANT_SETTINGS.maxTokens;
  }

  return model.maxOutputTokens;
}
