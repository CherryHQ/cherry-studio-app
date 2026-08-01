import type { AiPlugin } from '@cherrystudio/ai-core';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { type ToolCallRepairFunction, type ToolSet } from 'ai';
import * as Crypto from 'expo-crypto';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import type {
  AiUsageCaptureContext,
  AiUsageRecordService,
  MessageRef,
} from '@/backend/data/services/AiUsageRecordService';
import type { AssistantService } from '@/backend/data/services/AssistantService';
import type { ModelService } from '@/backend/data/services/ModelService';
import type { ProviderService } from '@/backend/data/services/ProviderService';
import type { ServingCredentialReceipt } from '@cherrystudio/shared/data/types/aiUsageRecord';
import type { Assistant } from '@cherrystudio/shared/data/types/assistant';
import type { Model, UniqueModelId } from '@cherrystudio/shared/data/types/model';
import { isUniqueModelId, parseUniqueModelId } from '@cherrystudio/shared/data/types/model';
import type { Provider } from '@cherrystudio/shared/data/types/provider';
import {
  isAnthropicModel,
  isForcedNativeWebSearchModel,
  isFunctionCallingModel,
} from '@cherrystudio/shared/utils/model';
import { createAiUsagePlugin } from '../../../hooks/billingHook';
import { resolveProviderAiSdkConfig } from '../../../provider/config';
import type { ToolService } from '../../../tools';
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
  extractAiSdkStandardParams,
  mergeCustomProviderParameters,
} from '../../../utils/options';
import { replacePromptVariables } from '../../../utils/promptVariables';
import { createAiUsageCaptureContext } from '../../../utils/usageCapture';
import type { AgentOptions } from '../Agent';
import {
  createToolCallLimitStopCondition,
  stopOnTerminalToolFailure,
} from '../loop/toolLoopTermination';
import { CITATIONS_SYSTEM_PROMPT } from '../prompts/citations';
import { getDeferredToolsSystemPrompt } from '../prompts/deferredTools';
import { buildAgentPlugins } from './buildAgentPlugins';
import { resolveCapabilities } from './capabilities';

export interface BuildAgentParamsDependencies {
  aiUsageRecord: Pick<AiUsageRecordService, 'recordInvocation'>;
  assistant: Pick<AssistantService, 'getById'>;
  model: Pick<ModelService, 'getById'>;
  preference: PreferenceService;
  provider: Pick<
    ProviderService,
    'getAuthConfig' | 'getByProviderId' | 'getRotatedApiKey' | 'resolveApiKey'
  >;
  tools: Pick<ToolService, 'resolveForRequest'>;
}

export interface BuildAgentParamsInput {
  request: AiBaseRequest & { apiKeyOverride?: string; chatId?: string; messageId?: string };
  services: BuildAgentParamsDependencies;
  shouldIncludeExternalTools?: boolean;
  usageMessageRef?: MessageRef | null;
}

export interface BuiltAgentParams {
  sdkConfig: ProviderConfig & { modelId: string };
  provider: Provider;
  model: Model;
  assistant: Assistant | undefined;
  context: RequestContext;
  system: string | undefined;
  plugins: AiPlugin[];
  repairToolCall: ToolCallRepairFunction<ToolSet>;
  tools: ToolSet | undefined;
  options: AgentOptions;
  credentialReceipt: ServingCredentialReceipt;
  usageCaptureContext: AiUsageCaptureContext;
}

export async function buildAgentParams({
  request,
  services,
  shouldIncludeExternalTools = false,
  usageMessageRef = null,
}: BuildAgentParamsInput): Promise<BuiltAgentParams> {
  const { provider, model, assistant } = await getProviderAndModel(request, services);
  const settingsAssistant = createSettingsAssistant(assistant, request.reasoningEffort);
  const { config: sdkConfig, credentialReceipt } = await resolveProviderAiSdkConfig(
    provider,
    model,
    {
      getAuthConfig: (providerId) => services.provider.getAuthConfig(providerId),
      resolveApiKey: (providerId, override) =>
        services.provider.resolveApiKey(providerId, override),
    },
    { apiKeyOverride: request.apiKeyOverride },
  );
  const externalWebSearchProviderId =
    shouldIncludeExternalTools && assistant?.settings.enableWebSearch
      ? await services.preference.get('chat.web_search.default_search_keywords_provider')
      : null;
  const shouldForceNativeWebSearch = isForcedNativeWebSearchModel(model);
  const hasConfiguredExternalWebSearch = Boolean(
    externalWebSearchProviderId && isFunctionCallingModel(model) && !shouldForceNativeWebSearch,
  );
  const capabilities = settingsAssistant
    ? resolveCapabilities(
        model,
        provider,
        settingsAssistant,
        sdkConfig.providerId,
        services.preference,
        {
          webSearchProviderId: hasConfiguredExternalWebSearch
            ? (externalWebSearchProviderId ?? undefined)
            : undefined,
        },
      )
    : undefined;
  const shouldUseExternalWebSearch = Boolean(
    shouldIncludeExternalTools &&
      assistant?.settings.enableWebSearch &&
      isFunctionCallingModel(model) &&
      (hasConfiguredExternalWebSearch || !capabilities?.webSearchPluginConfig),
  );
  let providerOptions =
    settingsAssistant && capabilities
      ? buildCapabilityProviderOptions(settingsAssistant, model, provider, capabilities)
      : {};
  const standardParams = assistant ? getAssistantStandardParams(assistant, model, provider) : {};
  const customParams = assistant ? getCustomParameters(assistant) : {};
  const split = extractAiSdkStandardParams(customParams);
  const filteredStandardParams = filterStandardParams(split.standardParams, model);
  providerOptions = mergeCustomProviderParameters(
    providerOptions,
    split.providerParams,
    sdkConfig.providerId,
  );
  const anthropicBetaHeaders =
    settingsAssistant && isAnthropicModel(model)
      ? addAnthropicHeaders(settingsAssistant, model, provider)
      : [];
  const headers =
    request.requestOptions?.headers || anthropicBetaHeaders.length > 0
      ? {
          ...request.requestOptions?.headers,
          ...(anthropicBetaHeaders.length > 0 && {
            'anthropic-beta': anthropicBetaHeaders.join(','),
          }),
        }
      : undefined;
  const usageCaptureContext = createAiUsageCaptureContext({
    providerId: provider.id,
    providerName: provider.name,
    modelId: model.modelId,
    modelName: model.name,
    pricing: model.pricing,
    trustProviderReportedCost: provider.apiFeatures.reportsActualCost,
    reportedCostCurrency: provider.reportedCostCurrency,
    credentialReceipt,
    source: assistant
      ? { type: 'assistant', id: assistant.id, name: assistant.name, icon: assistant.emoji }
      : null,
    messageRef: usageMessageRef,
  });
  const usagePlugin = createAiUsagePlugin(usageCaptureContext, services.aiUsageRecord);
  const plugins = [
    ...buildAgentPlugins({
      aiSdkProviderId: sdkConfig.providerId,
      model,
      provider,
      streamOutput: capabilities?.streamOutput ?? true,
      webSearchPluginConfig: capabilities?.webSearchPluginConfig,
    }),
    usagePlugin,
  ];
  const shouldLoadTools = shouldIncludeExternalTools && assistant && isFunctionCallingModel(model);
  const resolvedTools = shouldLoadTools
    ? await services.tools.resolveForRequest({
        assistant,
        contextWindow: model.contextWindow,
        externalWebSearchEnabled: shouldUseExternalWebSearch,
        mcpToolIds: request.mcpToolIds,
      })
    : { deferredEntries: [], tools: undefined };
  const tools = mergeToolSets(resolvedTools.tools, request.callOverrides?.tools);
  const baseSystem = assistant?.prompt
    ? await replacePromptVariables(assistant.prompt, model.name, services.preference)
    : undefined;
  const deferredSystem =
    tools && TOOL_SEARCH_TOOL_NAME in tools
      ? getDeferredToolsSystemPrompt(resolvedTools.deferredEntries)
      : undefined;
  const hasCitableTools = Boolean(
    tools?.web_search || resolvedTools.deferredEntries.some((entry) => entry.name === 'web_search'),
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
    modelId: model.modelId,
    providerId: sdkConfig.providerId,
    providerSettings: sdkConfig.providerSettings,
    getUsagePlugins: () => [usagePlugin],
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

  return {
    credentialReceipt,
    usageCaptureContext,
    sdkConfig: { ...sdkConfig, modelId: model.modelId },
    provider,
    model,
    assistant,
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
      ...(tools && {
        stopWhen: [
          createToolCallLimitStopCondition(
            assistant?.settings.enableMaxToolCalls ? assistant.settings.maxToolCalls : 20,
          ),
          stopOnTerminalToolFailure,
        ],
      }),
    },
  };
}

export function getCustomParameters(assistant: Assistant): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const item of assistant.settings?.customParameters ?? []) {
    params[item.name] = item.value;
  }
  return params;
}

function createSettingsAssistant(
  assistant: Assistant | undefined,
  reasoningEffort: AiBaseRequest['reasoningEffort'],
): Assistant | undefined {
  if (reasoningEffort === undefined) return assistant;

  return {
    ...assistant,
    settings: {
      ...assistant?.settings,
      reasoning_effort: reasoningEffort,
    },
  } as Assistant;
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
): Record<string, number> {
  const params: Record<string, number> = {};
  const temperature = getTemperature(assistant, model);
  const topP = getTopP(assistant, model);
  const maxOutputTokens = getMaxTokens(assistant, model, provider);

  if (temperature !== undefined) params.temperature = temperature;
  if (topP !== undefined) params.topP = topP;
  if (maxOutputTokens !== undefined) params.maxOutputTokens = maxOutputTokens;

  return params;
}

async function getProviderAndModel(
  request: BuildAgentParamsInput['request'],
  services: BuildAgentParamsDependencies,
): Promise<{ provider: Provider; model: Model; assistant: Assistant | undefined }> {
  let assistant: Assistant | undefined;
  if (request.assistantId) {
    assistant = await services.assistant.getById(request.assistantId);
  }

  let uniqueModelId: UniqueModelId | null | undefined;
  if (request.uniqueModelId) {
    uniqueModelId = request.uniqueModelId;
  } else if (request.assistantId) {
    if (!assistant?.modelId) {
      throw new Error(`Assistant ${request.assistantId} has no model configured`);
    }
    uniqueModelId = assistant.modelId;
  } else {
    const defaultModelId = await services.preference.get('chat.default_model_id');
    if (!defaultModelId) {
      uniqueModelId = null;
    } else if (!isUniqueModelId(defaultModelId)) {
      throw new Error(
        `Invalid default model configured for assistant-less topic: ${defaultModelId}`,
      );
    } else {
      uniqueModelId = defaultModelId;
    }
  }

  if (!uniqueModelId) {
    throw new Error('No default model configured for assistant-less topic');
  }

  const { providerId, modelId } = parseUniqueModelId(uniqueModelId);
  const [provider, model] = await Promise.all([
    services.provider.getByProviderId(providerId),
    services.model.getById(uniqueModelId),
  ]);
  if (!model) {
    throw new Error(`Cannot resolve model: ${providerId}::${modelId}`);
  }

  return { provider, model, assistant };
}
