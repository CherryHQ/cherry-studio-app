import type { JSONValue } from 'ai';

import type { Assistant } from '@/data/types/assistant';
import type { Model } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

import { getAiSdkProviderId } from '../provider/factory';
import type { ProviderCapabilities } from '../types';
import {
  getAnthropicReasoningParams,
  getGeminiReasoningParams,
  getReasoningEffort,
} from './reasoning';

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
  const { enableReasoning } = capabilities;

  if (!enableReasoning) {
    return {};
  }

  switch (rawProviderId) {
    case 'anthropic':
    case 'azure-anthropic':
      return {
        anthropic: getAnthropicReasoningParams(assistant, model) as Record<string, JSONValue>,
      };
    case 'google':
      return { google: getGeminiReasoningParams(assistant, model) as Record<string, JSONValue> };
    default:
      return {
        [rawProviderId]: getReasoningEffort(assistant, model, actualProvider) as Record<
          string,
          JSONValue
        >,
      };
  }
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
  const primaryAiSdkProviderId = actualAiSdkProviderIds[0] ?? rawProviderId;

  if (primaryAiSdkProviderId === 'openai-compatible' && 'reasoning_effort' in providerParams) {
    if (!('reasoningEffort' in providerParams)) {
      providerParams.reasoningEffort = providerParams.reasoning_effort;
    }
    delete providerParams.reasoning_effort;
  }

  let result = providerOptions;
  for (const key of Object.keys(providerParams)) {
    if (actualAiSdkProviderIds.includes(key)) {
      result = {
        ...result,
        [key]: {
          ...result[key],
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
