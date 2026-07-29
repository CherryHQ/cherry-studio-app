import type { AiPlugin } from '@cherrystudio/ai-core';
import { stepCountIs, type ToolCallRepairFunction, type ToolSet } from 'ai';
import * as Crypto from 'expo-crypto';

import type { AssistantService } from '@/data/services/AssistantService';
import type { ModelService } from '@/data/services/ModelService';
import type { PreferenceService } from '@/data/services/PreferenceService';
import type { ProviderService } from '@/data/services/ProviderService';
import type { Assistant } from '@/data/types/assistant';
import type { Model, UniqueModelId } from '@/data/types/model';
import { isUniqueModelId, parseUniqueModelId } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

import { providerToAiSdkConfig } from '../../../provider/config';
import type { ToolService } from '../../../tools';
import { TOOL_SEARCH_TOOL_NAME } from '../../../tools/meta/toolSearch';
import { getDeferredToolsSystemPrompt } from '../../../tools/prompts/deferredTools';
import { createAiRepair } from '../../../tools/repair';
import type { RequestContext } from '../../../tools/types';
import type { ProviderConfig } from '../../../types';
import type { AiBaseRequest } from '../../../types/requests';
import { addAnthropicHeaders } from '../../../utils/anthropicHeaders';
import {
  isAnthropicModel,
  isForcedNativeWebSearchModel,
  isFunctionCallingModel,
} from '../../../utils/model';
import {
  filterStandardParams,
  getMaxTokens,
  getTemperature,
  getTimeout,
  getTopP,
} from '../../../utils/modelParameters';
import {
  buildCapabilityProviderOptions,
  extractAiSdkStandardParams,
  mergeCustomProviderParameters,
} from '../../../utils/options';
import { replacePromptVariables } from '../../../utils/promptVariables';
import type { AgentOptions } from '../Agent';
import { buildAgentPlugins } from './buildAgentPlugins';
import { resolveCapabilities } from './capabilities';

export interface BuildAgentParamsDependencies {
  assistant: Pick<AssistantService, 'getById'>;
  model: Pick<ModelService, 'getById'>;
  preference: PreferenceService;
  provider: Pick<ProviderService, 'getAuthConfig' | 'getByProviderId' | 'getRotatedApiKey'>;
  tools: Pick<ToolService, 'resolveForRequest'>;
}

export interface BuildAgentParamsInput {
  request: AiBaseRequest & { apiKeyOverride?: string; chatId?: string; messageId?: string };
  services: BuildAgentParamsDependencies;
  shouldIncludeExternalTools?: boolean;
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
}

export async function buildAgentParams({
  request,
  services,
  shouldIncludeExternalTools = false,
}: BuildAgentParamsInput): Promise<BuiltAgentParams> {
  const { provider, model, assistant } = await getProviderAndModel(request, services);
  const sdkConfig = await providerToAiSdkConfig(provider, model, {
    getRotatedApiKey: async (providerId) =>
      request.apiKeyOverride ?? services.provider.getRotatedApiKey(providerId),
    getAuthConfig: (providerId) => services.provider.getAuthConfig(providerId),
  });
  const externalWebSearchProviderId =
    shouldIncludeExternalTools && assistant?.settings.enableWebSearch
      ? await services.preference.get('chat.web_search.default_search_keywords_provider')
      : null;
  const shouldForceNativeWebSearch = isForcedNativeWebSearchModel(model);
  const hasConfiguredExternalWebSearch = Boolean(
    externalWebSearchProviderId && isFunctionCallingModel(model) && !shouldForceNativeWebSearch,
  );
  const capabilities = assistant
    ? resolveCapabilities(model, provider, assistant, sdkConfig.providerId, services.preference, {
        webSearchProviderId: hasConfiguredExternalWebSearch
          ? (externalWebSearchProviderId ?? undefined)
          : undefined,
      })
    : undefined;
  const shouldUseExternalWebSearch = Boolean(
    shouldIncludeExternalTools &&
      assistant?.settings.enableWebSearch &&
      isFunctionCallingModel(model) &&
      (hasConfiguredExternalWebSearch || !capabilities?.webSearchPluginConfig),
  );
  const providerOptions =
    assistant && capabilities
      ? buildCapabilityProviderOptions(assistant, model, provider, capabilities)
      : {};
  const standardParams = assistant ? getAssistantStandardParams(assistant, model, provider) : {};
  const customParams = assistant ? getCustomParameters(assistant) : {};
  const split = extractAiSdkStandardParams(customParams);
  const filteredStandardParams = filterStandardParams(split.standardParams, model);
  const mergedProviderOptions = mergeCustomProviderParameters(
    providerOptions,
    split.providerParams,
    sdkConfig.providerId,
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
  const plugins = buildAgentPlugins({
    aiSdkProviderId: sdkConfig.providerId,
    model,
    provider,
    streamOutput: capabilities?.streamOutput ?? true,
    webSearchPluginConfig: capabilities?.webSearchPluginConfig,
  });
  const shouldLoadTools = shouldIncludeExternalTools && assistant && isFunctionCallingModel(model);
  const resolvedTools = shouldLoadTools
    ? await services.tools.resolveForRequest({
        assistant,
        contextWindow: model.contextWindow,
        externalWebSearchEnabled: shouldUseExternalWebSearch,
      })
    : { deferredEntries: [], tools: undefined };
  const tools = resolvedTools.tools;
  const baseSystem = assistant?.prompt
    ? await replacePromptVariables(assistant.prompt, model.name, services.preference)
    : undefined;
  const deferredSystem =
    tools && TOOL_SEARCH_TOOL_NAME in tools
      ? getDeferredToolsSystemPrompt(resolvedTools.deferredEntries)
      : undefined;
  const system = [baseSystem, deferredSystem].filter(Boolean).join('\n\n') || undefined;
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
  });

  return {
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
      ...(Object.keys(mergedProviderOptions).length > 0 && {
        providerOptions: mergedProviderOptions,
      }),
      ...standardParams,
      ...filteredStandardParams,
      ...(tools && {
        stopWhen: stepCountIs(
          assistant?.settings.enableMaxToolCalls ? assistant.settings.maxToolCalls : 20,
        ),
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
