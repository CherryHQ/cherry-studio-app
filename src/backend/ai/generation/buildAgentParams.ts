import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { AiPlugin } from '@cherrystudio/ai-core';
import { type ProviderConfig, resolveProviderOptionsKey } from '@cherrystudio/ai-runtime/provider';
import {
  buildAgentPlugins,
  createToolCallLimitStopCondition,
  stopOnTerminalToolFailure,
  type AiBaseRequest,
  type CallOverrides,
} from '@cherrystudio/ai-runtime/runtime';
import { createAiRepair, type RequestContext } from '@cherrystudio/ai-runtime/tools';
import {
  applyFastModeToProviderOptions,
  buildResolvedReasoningProviderOptions,
  filterStandardParams,
  getTimeout,
  resolveReasoningInvocation,
} from '@cherrystudio/ai-runtime/utils';
import {
  ENDPOINT_TYPE,
  endpointImpliedCapability,
  MODEL_CAPABILITY,
  type EndpointType,
} from '@cherrystudio/provider-registry';
import { type ToolCallRepairFunction, type ToolSet } from 'ai';
import * as Crypto from 'expo-crypto';

import {
  projectRuntimeReasoning,
  providerRegistryService,
} from '@/backend/data/services/ProviderRegistryService';
import type { ProviderService } from '@/backend/data/services/ProviderService';
import type { ServingCredentialReceipt } from '@/shared/data/types/aiUsageRecord';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { resolveProviderConnection } from '../provider/providerConnection';
import type { AiSdkGeneratorOptions } from './AiSdkGenerator';
import { resolveProviderAiSdkConfig } from './providerConfig';

export interface BuildAgentParamsDependencies {
  provider: Pick<ProviderService, 'getAuthConfig' | 'resolveApiKey'>;
}

export interface BuildAgentParamsInput {
  request: AiBaseRequest & { apiKeyOverride?: string };
  services: BuildAgentParamsDependencies;
  provider: Provider;
  model: Model;
  /** Late-bound usage middleware for nested tool-repair calls. */
  getRepairUsagePlugins?: () => AiPlugin[];
}

export interface BuiltAgentParams {
  sdkConfig: ProviderConfig & { modelId: string };
  context: RequestContext;
  plugins: AiPlugin[];
  repairToolCall: ToolCallRepairFunction<ToolSet>;
  tools: ToolSet | undefined;
  options: AiSdkGeneratorOptions;
  credentialReceipt: ServingCredentialReceipt;
}

/** Build the assistant-less AI SDK request used by naming, checks, and paintings. */
export async function buildAgentParams({
  request,
  services,
  provider,
  model,
  getRepairUsagePlugins,
}: BuildAgentParamsInput): Promise<BuiltAgentParams> {
  const connection = resolveProviderConnection(provider, model);
  const impliedCapability = endpointImpliedCapability(connection.endpointType);
  if (
    model.capabilities.includes(MODEL_CAPABILITY.EMBEDDING) ||
    model.capabilities.includes(MODEL_CAPABILITY.RERANK) ||
    impliedCapability === MODEL_CAPABILITY.EMBEDDING ||
    impliedCapability === MODEL_CAPABILITY.RERANK
  ) {
    throw new Error(`Mobile AI runtime does not support embedding or rerank models: ${model.id}`);
  }

  const { config: sdkConfig, credentialReceipt } = await resolveProviderAiSdkConfig(
    provider,
    model,
    {
      getAuthConfig: (providerId) => services.provider.getAuthConfig(providerId),
      resolveApiKey: (providerId, override) =>
        services.provider.resolveApiKey(providerId, override),
    },
    { apiKeyOverride: request.apiKeyOverride, resolvedConnection: connection },
  );
  const endpointType = connection.endpointType;
  const providerOptionsKey = resolveProviderOptionsKey(sdkConfig.providerId, {
    actualProviderId: provider.id,
    endpointType,
    gatewayProviderOptionsKey: connection.providerOptionsKey,
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
    selection: request.reasoningEffort ?? 'default',
    model: invocationModel,
    profile: reasoningProfile.wire,
    maxTokens: request.callOverrides?.maxOutputTokens ?? model.maxOutputTokens,
    assistantSummary:
      typeof provider.settings.summaryText === 'string' ? provider.settings.summaryText : undefined,
  });
  const providerOptions =
    request.reasoningEffort === undefined
      ? {}
      : buildResolvedReasoningProviderOptions({
          aiSdkProviderId: sdkConfig.providerId,
          providerOptionsKey,
          endpointType,
          reasoning,
        });
  const plugins = buildAgentPlugins({
    aiSdkProviderId: sdkConfig.providerId,
    endpointType,
    hasMcpTools: false,
    hasReasoningSelectionSource: request.reasoningEffort !== undefined,
    model,
    provider,
    reasoning,
    streamOutput: true,
  });
  const tools = request.callOverrides?.tools;
  const repairToolCall = createAiRepair({
    modelId: connection.wireModelId,
    providerId: sdkConfig.providerId,
    providerSettings: sdkConfig.providerSettings,
    getUsagePlugins: getRepairUsagePlugins,
  });
  const overridden = applyCallOverrides(
    { providerOptions, standardParams: {} },
    request.callOverrides,
    model,
  );
  const effectiveProviderOptions = enforceSystemInstructionRole(
    applyFastModeToProviderOptions(
      provider,
      model,
      overridden.providerOptions,
      request.fastMode === true,
    ),
    endpointType,
    providerOptionsKey,
  );

  return {
    credentialReceipt,
    sdkConfig: { ...sdkConfig, modelId: connection.wireModelId },
    context: {
      abortSignal: request.requestOptions?.signal,
      requestId: Crypto.randomUUID(),
    },
    plugins,
    repairToolCall,
    tools,
    options: {
      maxRetries: request.requestOptions?.maxRetries ?? 0,
      timeout: request.requestOptions?.timeout ?? getTimeout(model),
      ...(request.requestOptions?.headers && { headers: request.requestOptions.headers }),
      ...(request.callOverrides?.toolChoice && {
        toolChoice: request.callOverrides.toolChoice,
      }),
      ...(Object.keys(effectiveProviderOptions).length > 0 && {
        providerOptions: effectiveProviderOptions,
      }),
      ...overridden.standardParams,
      ...(tools && {
        stopWhen: [createToolCallLimitStopCondition(20), stopOnTerminalToolFailure],
      }),
    },
  };
}

/** Native OpenAI adapters otherwise promote reasoning-model instructions to `developer`. */
function enforceSystemInstructionRole(
  providerOptions: ProviderOptions,
  endpointType: EndpointType | undefined,
  providerOptionsKey: string,
): ProviderOptions {
  const isOpenAIInstructionEndpoint =
    endpointType === ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS ||
    endpointType === ENDPOINT_TYPE.OPENAI_RESPONSES;
  if (!isOpenAIInstructionEndpoint || providerOptionsKey !== 'openai') {
    return providerOptions;
  }

  return {
    ...providerOptions,
    openai: {
      ...providerOptions.openai,
      systemMessageMode: 'system',
    },
  };
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
