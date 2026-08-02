import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { EndpointType, Model } from '@cherrystudio/universal/data/types/model';
import type {
  OpenAIServiceTier,
  Provider,
  ServiceTier,
} from '@cherrystudio/universal/data/types/provider';
import {
  getModelSupportedVerbosity,
  isOpenAIModel,
  isReasoningModel,
  isSupportFlexServiceTierModel,
  isSupportVerbosityModel,
} from '@cherrystudio/universal/utils/model';
import type { JSONValue } from 'ai';

import type { AppProviderId, ProviderCapabilities } from '../types';
import { addAnthropicHeaders } from './anthropicHeaders';
import { buildGeminiGenerateImageParams } from './image';
import { SystemProviderIds } from './providerIds';
import {
  encodeReasoningInvocation,
  type ResolvedReasoningInvocation,
} from './reasoningSerializers';
import { getWebSearchParams } from './websearch';

type OpenAIVerbosity = 'low' | 'medium' | 'high' | null | undefined;
type GroqServiceTier = 'auto' | 'on_demand' | 'flex' | null | undefined;

const AI_SDK_PARAMS = new Set([
  'temperature',
  'topP',
  'topK',
  'maxOutputTokens',
  'presencePenalty',
  'frequencyPenalty',
  'stopSequences',
  'seed',
]);

const OpenAIServiceTiers = ['auto', 'default', 'flex', 'priority'] as const;
const GroqServiceTiers = ['auto', 'on_demand', 'flex'] as const;

export function applyFastModeToProviderOptions(
  provider: Pick<Provider, 'fastMode'>,
  model: Pick<Model, 'supportsFastMode'>,
  providerOptions: ProviderOptions,
  fastMode: boolean,
): ProviderOptions {
  if (!fastMode || !model.supportsFastMode || provider.fastMode?.transport !== 'openai-priority') {
    return providerOptions;
  }

  return {
    ...providerOptions,
    openai: {
      ...providerOptions.openai,
      serviceTier: 'priority',
    },
  };
}

type GroqProvider = Provider & { id: 'groq' };
type NonGroqProvider = Provider & { id: Exclude<string, 'groq'> };

function isGroqProvider(provider: Provider): provider is GroqProvider {
  return provider.id === SystemProviderIds.groq;
}

function isOpenAIServiceTier(serviceTier: ServiceTier): serviceTier is OpenAIServiceTier {
  return serviceTier == null || OpenAIServiceTiers.includes(serviceTier as never);
}

function isGroqServiceTier(serviceTier: ServiceTier): serviceTier is GroqServiceTier {
  return serviceTier == null || GroqServiceTiers.includes(serviceTier as never);
}

function toOpenAIServiceTier(model: Model, serviceTier: ServiceTier): OpenAIServiceTier {
  if (
    !isOpenAIServiceTier(serviceTier) ||
    (serviceTier === 'flex' && !isSupportFlexServiceTierModel(model))
  ) {
    return undefined;
  }
  return serviceTier;
}

function toGroqServiceTier(model: Model, serviceTier: ServiceTier): GroqServiceTier {
  if (
    !isGroqServiceTier(serviceTier) ||
    (serviceTier === 'flex' && !isSupportFlexServiceTierModel(model))
  ) {
    return undefined;
  }
  return serviceTier;
}

function getServiceTier<T extends GroqProvider>(model: Model, provider: T): GroqServiceTier;
function getServiceTier<T extends NonGroqProvider>(model: Model, provider: T): OpenAIServiceTier;
function getServiceTier<T extends Provider>(
  model: Model,
  provider: T,
): OpenAIServiceTier | GroqServiceTier {
  const serviceTierSetting = provider.settings.serviceTier as ServiceTier | undefined;

  if (!provider.apiFeatures?.serviceTier || !isOpenAIModel(model) || !serviceTierSetting) {
    return undefined;
  }

  if (isGroqProvider(provider)) {
    return toGroqServiceTier(model, serviceTierSetting);
  }
  return toOpenAIServiceTier(model, serviceTierSetting);
}

function getVerbosity(model: Model, provider: Provider): OpenAIVerbosity {
  if (!isSupportVerbosityModel(model) || !provider.apiFeatures?.verbosity) {
    return undefined;
  }

  const userVerbosity = provider.settings.verbosity as OpenAIVerbosity;
  if (userVerbosity) {
    const supportedVerbosity = getModelSupportedVerbosity(model);
    return supportedVerbosity.includes(userVerbosity)
      ? userVerbosity
      : (supportedVerbosity[0] as OpenAIVerbosity);
  }
  return undefined;
}

function mergeRecords<T extends Record<string, unknown>>(...items: T[]): T {
  const result: Record<string, unknown> = {};
  for (const item of items) {
    for (const [key, value] of Object.entries(item)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        result[key] &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key])
      ) {
        result[key] = mergeRecords(result[key] as T, value as T);
      } else {
        result[key] = value;
      }
    }
  }
  return result as T;
}

export function extractAiSdkStandardParams(customParams: Record<string, any>): {
  standardParams: Partial<Record<string, any>>;
  providerParams: Record<string, any>;
} {
  const standardParams: Partial<Record<string, any>> = {};
  const providerParams: Record<string, any> = {};

  for (const [key, value] of Object.entries(customParams)) {
    if (AI_SDK_PARAMS.has(key)) {
      standardParams[key] = value;
    } else {
      providerParams[key] = value;
    }
  }
  return { standardParams, providerParams };
}

function shouldNormalizeOpenAICompatibleReasoning(
  providerId: AppProviderId,
  endpointType: EndpointType | undefined,
): boolean {
  return (
    providerId === 'openai-compatible' ||
    providerId === 'github-copilot-openai-compatible' ||
    providerId === 'google-vertex-maas' ||
    (endpointType === ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS &&
      (providerId === 'aihubmix' || providerId === SystemProviderIds.dmxapi))
  );
}

export function buildCapabilityProviderOptions(
  assistant: Assistant,
  model: Model,
  actualProvider: Provider,
  capabilities: Pick<
    ProviderCapabilities,
    'enableReasoning' | 'enableWebSearch' | 'enableGenerateImage'
  >,
  context: {
    aiSdkProviderId: AppProviderId;
    runtimeProviderId: AppProviderId;
    providerOptionsKey: string;
    endpointType: EndpointType | undefined;
    reasoning: ResolvedReasoningInvocation;
  },
): Record<string, Record<string, JSONValue>> {
  const rawProviderId = context.runtimeProviderId;
  const providerOptionsKey = context.providerOptionsKey;
  const serviceTier = getServiceTier(model, actualProvider);
  const textVerbosity = getVerbosity(model, actualProvider);
  const resolvedReasoningOptions = capabilities.enableReasoning
    ? encodeReasoningOptions(providerOptionsKey, context.reasoning)
    : {
        providerId: rawProviderId === 'openai-compatible' ? actualProvider.id : providerOptionsKey,
        options: {},
      };
  const reasoningOptions = shouldNormalizeOpenAICompatibleReasoning(
    rawProviderId,
    context.endpointType,
  )
    ? {
        ...resolvedReasoningOptions,
        options: normalizeOpenAICompatibleParams(resolvedReasoningOptions.options),
      }
    : resolvedReasoningOptions;

  let providerSpecificOptions: Record<string, any> = {};

  switch (rawProviderId) {
    case 'openai':
    case 'openai-chat':
    case 'azure':
    case 'azure-responses':
    case 'huggingface':
      providerSpecificOptions = buildOpenAIProviderOptions(
        model,
        capabilities,
        actualProvider,
        serviceTier,
        textVerbosity,
        reasoningOptions.options,
      );
      break;
    case 'anthropic':
    case 'azure-anthropic':
      providerSpecificOptions = buildAnthropicProviderOptions(reasoningOptions.options);
      break;
    case 'google-vertex-anthropic':
      providerSpecificOptions = buildAnthropicProviderOptions(
        reasoningOptions.options,
        providerOptionsKey,
      );
      break;
    case 'google':
      providerSpecificOptions = buildGeminiProviderOptions(
        model,
        capabilities,
        reasoningOptions.options,
      );
      break;
    case 'google-vertex':
      providerSpecificOptions = buildGeminiProviderOptions(
        model,
        capabilities,
        reasoningOptions.options,
        providerOptionsKey,
      );
      break;
    case 'xai':
    case 'xai-responses':
      providerSpecificOptions = buildXAIProviderOptions(reasoningOptions.options);
      break;
    case 'bedrock':
      providerSpecificOptions = buildBedrockProviderOptions(
        assistant,
        model,
        actualProvider,
        reasoningOptions.options,
      );
      break;
    case 'ollama':
      providerSpecificOptions = buildOllamaProviderOptions(model, reasoningOptions.options);
      break;
    case 'cherryin':
    case 'cherryin-chat':
    case 'newapi':
    case 'aihubmix':
    case SystemProviderIds.dmxapi:
    case SystemProviderIds.gateway:
      providerSpecificOptions = buildAiGatewayOptions(
        model,
        capabilities,
        actualProvider,
        serviceTier,
        textVerbosity,
        context.endpointType,
        reasoningOptions,
      );
      break;
    default:
      providerSpecificOptions = buildGenericProviderOptions(
        reasoningOptions.providerId,
        model,
        capabilities,
        reasoningOptions.options,
      );
      providerSpecificOptions = {
        ...providerSpecificOptions,
        [reasoningOptions.providerId]: {
          ...providerSpecificOptions[reasoningOptions.providerId],
          serviceTier,
          textVerbosity,
        },
      };
      break;
  }

  return providerSpecificOptions as Record<string, Record<string, JSONValue>>;
}

function encodeReasoningOptions(
  providerOptionsKey: string,
  invocation: ResolvedReasoningInvocation,
): { providerId: string; options: Record<string, unknown> } {
  return { providerId: providerOptionsKey, options: encodeReasoningInvocation(invocation) };
}

/** Build the single providerOptions namespace that owns reasoning for this endpoint adapter. */
export function buildResolvedReasoningProviderOptions(context: {
  aiSdkProviderId: AppProviderId;
  providerOptionsKey: string;
  endpointType: EndpointType | undefined;
  reasoning: ResolvedReasoningInvocation;
}): Record<string, Record<string, JSONValue>> {
  const encoded = encodeReasoningOptions(context.providerOptionsKey, context.reasoning);
  const options = shouldNormalizeOpenAICompatibleReasoning(
    context.aiSdkProviderId,
    context.endpointType,
  )
    ? normalizeOpenAICompatibleParams(encoded.options)
    : encoded.options;
  return Object.keys(options).length > 0
    ? ({ [encoded.providerId]: options } as Record<string, Record<string, JSONValue>>)
    : {};
}

/**
 * For `openai-compatible`, rename `reasoning_effort` -> `reasoningEffort` —
 * AI SDK silently drops the snake_case form.
 */
export function mergeCustomProviderParameters(
  providerOptions: Record<string, Record<string, JSONValue>>,
  providerParams: Record<string, any>,
  rawProviderId: string,
  adapterFamily: AppProviderId = rawProviderId as AppProviderId,
): Record<string, Record<string, JSONValue>> {
  const actualAiSdkProviderIds = Object.keys(providerOptions);
  const primaryAiSdkProviderId = actualAiSdkProviderIds[0];
  const normalizedProviderParams =
    adapterFamily === 'openai-compatible'
      ? normalizeOpenAICompatibleParams(providerParams)
      : providerParams;

  let result = providerOptions;
  for (const key of Object.keys(normalizedProviderParams)) {
    const isProviderNamespace = actualAiSdkProviderIds.includes(key) || key === rawProviderId;
    const value =
      adapterFamily === 'openai-compatible' &&
      isProviderNamespace &&
      normalizedProviderParams[key] !== null &&
      typeof normalizedProviderParams[key] === 'object' &&
      !Array.isArray(normalizedProviderParams[key])
        ? normalizeOpenAICompatibleParams(normalizedProviderParams[key])
        : normalizedProviderParams[key];
    if (actualAiSdkProviderIds.includes(key)) {
      result = {
        ...result,
        [key]: {
          ...result[key],
          ...value,
        },
      };
    } else if (key === rawProviderId && !actualAiSdkProviderIds.includes(rawProviderId)) {
      if (key === SystemProviderIds.gateway) {
        result = {
          ...result,
          [key]: {
            ...result[key],
            ...value,
          },
        };
      } else {
        result = {
          ...result,
          [primaryAiSdkProviderId]: {
            ...result[primaryAiSdkProviderId],
            ...value,
          },
        };
      }
    } else {
      result = {
        ...result,
        [primaryAiSdkProviderId]: {
          ...result[primaryAiSdkProviderId],
          [key]: value,
        },
      };
    }
  }
  return result;
}

function normalizeOpenAICompatibleParams(params: Record<string, any>): Record<string, any> {
  if (!('reasoning_effort' in params)) return params;

  const normalized = { ...params };
  if (!('reasoningEffort' in normalized)) normalized.reasoningEffort = normalized.reasoning_effort;
  delete normalized.reasoning_effort;
  return normalized;
}

function buildOpenAIProviderOptions(
  model: Model,
  capabilities: Pick<
    ProviderCapabilities,
    'enableReasoning' | 'enableWebSearch' | 'enableGenerateImage'
  >,
  provider: Provider,
  serviceTier: OpenAIServiceTier,
  textVerbosity?: OpenAIVerbosity,
  reasoningOptions: Record<string, unknown> = {},
): Record<string, Record<string, unknown>> {
  let providerOptions: Record<string, unknown> = {};
  if (capabilities.enableReasoning) {
    providerOptions = {
      ...providerOptions,
      ...reasoningOptions,
      ...(isReasoningModel(model) && { forceReasoning: true }),
    };
  }

  if (isSupportVerbosityModel(model) && provider.apiFeatures?.verbosity) {
    const userVerbosity = provider.settings.verbosity as OpenAIVerbosity;
    if (userVerbosity && ['low', 'medium', 'high'].includes(userVerbosity)) {
      const supportedVerbosity = getModelSupportedVerbosity(model);
      providerOptions.textVerbosity = supportedVerbosity.includes(userVerbosity)
        ? userVerbosity
        : supportedVerbosity[0];
    }
  }

  providerOptions = {
    ...providerOptions,
    serviceTier,
    textVerbosity,
    store: false,
  };
  return { openai: providerOptions };
}

function buildAnthropicProviderOptions(
  reasoningOptions: Record<string, unknown>,
  providerOptionsKey = 'anthropic',
): Record<string, Record<string, unknown>> {
  return { [providerOptionsKey]: { ...reasoningOptions } };
}

function buildGeminiProviderOptions(
  model: Model,
  capabilities: Pick<
    ProviderCapabilities,
    'enableReasoning' | 'enableWebSearch' | 'enableGenerateImage'
  >,
  reasoningOptions: Record<string, unknown>,
  providerOptionsKey = 'google',
): Record<string, Record<string, unknown>> {
  let providerOptions: Record<string, unknown> = {
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
    ],
  };
  providerOptions = { ...providerOptions, ...reasoningOptions };
  if (capabilities.enableWebSearch) {
    providerOptions = mergeRecords(providerOptions, getWebSearchParams(model));
  }
  if (capabilities.enableGenerateImage) {
    providerOptions = { ...providerOptions, ...buildGeminiGenerateImageParams() };
  }
  return { [providerOptionsKey]: providerOptions };
}

function buildXAIProviderOptions(
  reasoningOptions: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  return { xai: { ...reasoningOptions } };
}

function buildBedrockProviderOptions(
  assistant: Assistant,
  model: Model,
  provider: Provider,
  reasoningOptions: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  const providerOptions: Record<string, unknown> = { ...reasoningOptions };
  // MOBILE SYNC DIVERGENCE: desktop currently omits `provider` here and leaks a
  // direct-Anthropic beta header into Bedrock, contradicting its own resolver contract.
  const betaHeaders = addAnthropicHeaders(assistant, model, provider);
  if (betaHeaders.length > 0) {
    providerOptions.anthropicBeta = betaHeaders;
  }
  return { bedrock: providerOptions };
}

function buildOllamaProviderOptions(
  model: Model,
  reasoningOptions: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  return {
    ollama: {
      ...reasoningOptions,
      ...(model.contextWindow ? { options: { num_ctx: model.contextWindow } } : {}),
    },
  };
}

function buildGenericProviderOptions(
  providerId: string,
  model: Model,
  capabilities: Pick<
    ProviderCapabilities,
    'enableReasoning' | 'enableWebSearch' | 'enableGenerateImage'
  >,
  reasoningOptions: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  let providerOptions: Record<string, unknown> = { ...reasoningOptions };

  if (capabilities.enableWebSearch) {
    providerOptions = mergeRecords(providerOptions, getWebSearchParams(model));
  }

  return { [providerId]: providerOptions };
}

function buildAiGatewayOptions(
  model: Model,
  capabilities: Pick<
    ProviderCapabilities,
    'enableReasoning' | 'enableWebSearch' | 'enableGenerateImage'
  >,
  provider: Provider,
  serviceTier: OpenAIServiceTier,
  textVerbosity?: OpenAIVerbosity,
  endpointType?: EndpointType,
  reasoning: { providerId: string; options: Record<string, unknown> } = {
    providerId: 'openai-compatible',
    options: {},
  },
): Record<string, Record<string, unknown>> {
  switch (endpointType) {
    case ENDPOINT_TYPE.ANTHROPIC_MESSAGES:
      return buildAnthropicProviderOptions(reasoning.options);
    case ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT:
      return buildGeminiProviderOptions(model, capabilities, reasoning.options);
    case ENDPOINT_TYPE.OPENAI_RESPONSES:
      return buildOpenAIProviderOptions(
        model,
        capabilities,
        provider,
        serviceTier,
        textVerbosity,
        reasoning.options,
      );
    case ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS:
    case ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION:
      return buildGenericProviderOptions(
        reasoning.providerId,
        model,
        capabilities,
        reasoning.options,
      );
  }
  return { [reasoning.providerId]: reasoning.options };
}
