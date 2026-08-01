import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { Model } from '@cherrystudio/universal/data/types/model';
import type {
  OpenAIServiceTier,
  Provider,
  ServiceTier,
} from '@cherrystudio/universal/data/types/provider';
import {
  getModelSupportedVerbosity,
  isAnthropicModel,
  isGeminiModel,
  isGrokModel,
  isOpenAIModel,
  isReasoningModel,
  isSupportFlexServiceTierModel,
  isSupportVerbosityModel,
} from '@cherrystudio/universal/utils/model';
import type { JSONValue } from 'ai';

import { getAiSdkProviderId } from '../provider/factory';
import type { ProviderCapabilities } from '../types';
import { buildGeminiGenerateImageParams } from './image';
import { SystemProviderIds } from './providerIds';
import {
  getAnthropicReasoningParams,
  getGeminiReasoningParams,
  getOpenAIReasoningParams,
  getReasoningEffort,
  getXAIReasoningParams,
} from './reasoning';
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

export function buildCapabilityProviderOptions(
  assistant: Assistant,
  model: Model,
  actualProvider: Provider,
  capabilities: Pick<
    ProviderCapabilities,
    'enableReasoning' | 'enableWebSearch' | 'enableGenerateImage'
  >,
): Record<string, Record<string, JSONValue>> {
  const rawProviderId = getAiSdkProviderId(actualProvider);
  const serviceTier = getServiceTier(model, actualProvider);
  const textVerbosity = getVerbosity(model, actualProvider);

  let providerSpecificOptions: Record<string, any>;

  switch (rawProviderId) {
    case 'openai':
    case 'openai-chat':
    case 'azure':
    case 'azure-responses':
    case 'huggingface':
      providerSpecificOptions = buildOpenAIProviderOptions(
        assistant,
        model,
        capabilities,
        actualProvider,
        serviceTier,
        textVerbosity,
      );
      break;
    case 'anthropic':
    case 'azure-anthropic':
      providerSpecificOptions = buildAnthropicProviderOptions(assistant, model, capabilities);
      break;
    case 'google':
      providerSpecificOptions = buildGeminiProviderOptions(assistant, model, capabilities);
      break;
    case 'xai':
    case 'xai-responses':
      providerSpecificOptions = buildXAIProviderOptions(assistant, model, capabilities);
      break;
    case 'cherryin':
    case 'newapi':
    case 'aihubmix':
    case SystemProviderIds.gateway:
      providerSpecificOptions = buildAiGatewayOptions(
        assistant,
        model,
        capabilities,
        actualProvider,
        serviceTier,
        textVerbosity,
      );
      break;
    default:
      providerSpecificOptions = buildGenericProviderOptions(
        rawProviderId,
        assistant,
        model,
        capabilities,
        actualProvider,
      );
      providerSpecificOptions = {
        ...providerSpecificOptions,
        [rawProviderId]: {
          ...providerSpecificOptions[rawProviderId],
          serviceTier,
          textVerbosity,
        },
      };
      break;
  }

  return providerSpecificOptions as Record<string, Record<string, JSONValue>>;
}

/**
 * For `openai-compatible`, rename `reasoning_effort` -> `reasoningEffort` —
 * AI SDK silently drops the snake_case form.
 */
export function mergeCustomProviderParameters(
  providerOptions: Record<string, Record<string, JSONValue>>,
  providerParams: Record<string, any>,
  rawProviderId: string,
): Record<string, Record<string, JSONValue>> {
  const actualAiSdkProviderIds = Object.keys(providerOptions);
  const actualAiSdkProviderIdSet = new Set(actualAiSdkProviderIds);
  const primaryAiSdkProviderId = actualAiSdkProviderIds[0] ?? rawProviderId;

  if (primaryAiSdkProviderId === 'openai-compatible' && 'reasoning_effort' in providerParams) {
    if (!('reasoningEffort' in providerParams)) {
      providerParams.reasoningEffort = providerParams.reasoning_effort;
    }
    delete providerParams.reasoning_effort;
  }

  let result = providerOptions;
  for (const key of Object.keys(providerParams)) {
    if (actualAiSdkProviderIdSet.has(key)) {
      result = {
        ...result,
        [key]: {
          ...result[key],
          ...providerParams[key],
        },
      };
    } else if (key === rawProviderId && !actualAiSdkProviderIdSet.has(rawProviderId)) {
      result = {
        ...result,
        [primaryAiSdkProviderId]: {
          ...result[primaryAiSdkProviderId],
          ...providerParams[key],
        },
      };
    } else {
      result = {
        ...result,
        [primaryAiSdkProviderId]: {
          ...result[primaryAiSdkProviderId],
          [key]: providerParams[key],
        },
      };
    }
  }
  return result;
}

function buildOpenAIProviderOptions(
  assistant: Assistant,
  model: Model,
  capabilities: Pick<
    ProviderCapabilities,
    'enableReasoning' | 'enableWebSearch' | 'enableGenerateImage'
  >,
  provider: Provider,
  serviceTier: OpenAIServiceTier,
  textVerbosity?: OpenAIVerbosity,
): Record<string, Record<string, unknown>> {
  let providerOptions: Record<string, unknown> = {};
  if (capabilities.enableReasoning) {
    providerOptions = {
      ...providerOptions,
      ...getOpenAIReasoningParams(assistant, model),
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
  assistant: Assistant,
  model: Model,
  capabilities: Pick<
    ProviderCapabilities,
    'enableReasoning' | 'enableWebSearch' | 'enableGenerateImage'
  >,
): Record<string, Record<string, unknown>> {
  let providerOptions: Record<string, unknown> = {};
  if (capabilities.enableReasoning) {
    providerOptions = { ...providerOptions, ...getAnthropicReasoningParams(assistant, model) };
  }
  return { anthropic: providerOptions };
}

function buildGeminiProviderOptions(
  assistant: Assistant,
  model: Model,
  capabilities: Pick<
    ProviderCapabilities,
    'enableReasoning' | 'enableWebSearch' | 'enableGenerateImage'
  >,
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
  if (capabilities.enableReasoning) {
    providerOptions = { ...providerOptions, ...getGeminiReasoningParams(assistant, model) };
  }
  if (capabilities.enableWebSearch) {
    providerOptions = mergeRecords(providerOptions, getWebSearchParams(model));
  }
  if (capabilities.enableGenerateImage) {
    providerOptions = { ...providerOptions, ...buildGeminiGenerateImageParams() };
  }
  return { google: providerOptions };
}

function buildXAIProviderOptions(
  assistant: Assistant,
  model: Model,
  capabilities: Pick<
    ProviderCapabilities,
    'enableReasoning' | 'enableWebSearch' | 'enableGenerateImage'
  >,
): Record<string, Record<string, unknown>> {
  let providerOptions: Record<string, unknown> = {};
  if (capabilities.enableReasoning) {
    providerOptions = { ...providerOptions, ...getXAIReasoningParams(assistant, model) };
  }
  return { xai: providerOptions };
}

function buildGenericProviderOptions(
  providerId: string,
  assistant: Assistant,
  model: Model,
  capabilities: Pick<
    ProviderCapabilities,
    'enableReasoning' | 'enableWebSearch' | 'enableGenerateImage'
  >,
  provider: Provider,
): Record<string, Record<string, unknown>> {
  let providerOptions: Record<string, unknown> = {};

  if (capabilities.enableReasoning) {
    providerOptions = { ...providerOptions, ...getReasoningEffort(assistant, model, provider) };
  }

  if (capabilities.enableWebSearch) {
    providerOptions = mergeRecords(providerOptions, getWebSearchParams(model));
  }

  return { [providerId]: providerOptions };
}

function buildAiGatewayOptions(
  assistant: Assistant,
  model: Model,
  capabilities: Pick<
    ProviderCapabilities,
    'enableReasoning' | 'enableWebSearch' | 'enableGenerateImage'
  >,
  provider: Provider,
  serviceTier: OpenAIServiceTier,
  textVerbosity?: OpenAIVerbosity,
): Record<string, Record<string, unknown>> {
  switch (model.endpointTypes?.[0]) {
    case ENDPOINT_TYPE.ANTHROPIC_MESSAGES:
      return buildAnthropicProviderOptions(assistant, model, capabilities);
    case ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT:
      return buildGeminiProviderOptions(assistant, model, capabilities);
    case ENDPOINT_TYPE.OPENAI_RESPONSES:
      return buildOpenAIProviderOptions(
        assistant,
        model,
        capabilities,
        provider,
        serviceTier,
        textVerbosity,
      );
    case ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS:
    case ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION:
      return buildGenericProviderOptions(
        'openai-compatible',
        assistant,
        model,
        capabilities,
        provider,
      );
  }

  if (isAnthropicModel(model)) return buildAnthropicProviderOptions(assistant, model, capabilities);
  if (isOpenAIModel(model)) {
    return buildOpenAIProviderOptions(
      assistant,
      model,
      capabilities,
      provider,
      serviceTier,
      textVerbosity,
    );
  }
  if (isGeminiModel(model)) return buildGeminiProviderOptions(assistant, model, capabilities);
  if (isGrokModel(model)) return buildXAIProviderOptions(assistant, model, capabilities);
  return buildGenericProviderOptions('openai-compatible', assistant, model, capabilities, provider);
}
