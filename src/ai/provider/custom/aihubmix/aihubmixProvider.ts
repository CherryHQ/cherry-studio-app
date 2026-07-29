import { AnthropicMessagesLanguageModel } from '@ai-sdk/anthropic/internal';
import { GoogleGenerativeAILanguageModel } from '@ai-sdk/google/internal';
import { OpenAIChatLanguageModel, OpenAIResponsesLanguageModel } from '@ai-sdk/openai/internal';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
  OpenAICompatibleImageModel,
} from '@ai-sdk/openai-compatible';
import type { EmbeddingModelV3, ImageModelV3, LanguageModelV3, ProviderV3 } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils';

import type { Model } from '@/data/types/model';

import { isOpenAIChatCompletionOnlyModel, isOpenAILLMModel } from '../../utils/model';

export const AIHUBMIX_PROVIDER_NAME = 'aihubmix' as const;
const APP_CODE_HEADER = { 'APP-Code': 'MLTG2087' };

export interface AihubmixProviderSettings {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
}

export interface AihubmixProvider extends ProviderV3 {
  (modelId: string): LanguageModelV3;
  languageModel(modelId: string): LanguageModelV3;
  embeddingModel(modelId: string): EmbeddingModelV3;
  imageModel(modelId: string): ImageModelV3;
}

export function createAihubmix(options: AihubmixProviderSettings = {}): AihubmixProvider {
  const { baseURL = 'https://aihubmix.com/v1', fetch: customFetch } = options;

  const resolveApiKey = () =>
    loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'AIHUBMIX_API_KEY',
      description: 'AiHubMix',
    });

  const authHeaders = (): Record<string, string> => ({
    Authorization: `Bearer ${resolveApiKey()}`,
    ...APP_CODE_HEADER,
    ...options.headers,
  });

  const url = ({ path }: { path: string; modelId: string }) =>
    `${withoutTrailingSlash(baseURL)}${path}`;

  const createAnthropicModel = (modelId: string) => {
    const headers = authHeaders();
    return new AnthropicMessagesLanguageModel(modelId, {
      provider: `${AIHUBMIX_PROVIDER_NAME}.anthropic`,
      baseURL,
      headers: () => ({ ...headers, 'x-api-key': resolveApiKey() }),
      fetch: customFetch,
      supportedUrls: () => ({ 'image/*': [/^https?:\/\/.*$/] }),
      supportsNativeStructuredOutput: false,
    });
  };

  const createGeminiModel = (modelId: string) => {
    const headers = authHeaders();
    return new GoogleGenerativeAILanguageModel(modelId, {
      provider: `${AIHUBMIX_PROVIDER_NAME}.google`,
      baseURL: 'https://aihubmix.com/gemini/v1beta',
      headers: () => ({ ...headers, 'x-goog-api-key': resolveApiKey() }),
      fetch: customFetch,
      generateId: () => `${AIHUBMIX_PROVIDER_NAME}-${Date.now()}`,
      supportedUrls: () => ({}),
    });
  };

  const createOpenAICompatibleChatModel = (modelId: string): LanguageModelV3 =>
    new OpenAICompatibleChatLanguageModel(modelId, {
      provider: `openai-compatible.${AIHUBMIX_PROVIDER_NAME}`,
      url,
      headers: authHeaders,
      fetch: customFetch,
    });

  const createOpenAIChatModel = (modelId: string): LanguageModelV3 =>
    new OpenAIChatLanguageModel(modelId, {
      provider: `openai-compatible.${AIHUBMIX_PROVIDER_NAME}`,
      url,
      headers: authHeaders,
      fetch: customFetch,
    });

  const createResponsesModel = (modelId: string): LanguageModelV3 =>
    new OpenAIResponsesLanguageModel(modelId, {
      provider: `${AIHUBMIX_PROVIDER_NAME}.openai-response`,
      url,
      headers: authHeaders,
      fetch: customFetch,
      fileIdPrefixes: ['file-'],
    });

  const createChatModel = (modelId: string): LanguageModelV3 => {
    if (modelId.startsWith('claude')) {
      return createAnthropicModel(modelId);
    }
    if (
      (modelId.startsWith('gemini') || modelId.startsWith('imagen')) &&
      !modelId.endsWith('no-think') &&
      !modelId.endsWith('-search') &&
      !modelId.includes('embedding')
    ) {
      return createGeminiModel(modelId);
    }

    const model: Model = {
      capabilities: [],
      id: `aihubmix::${modelId}`,
      isDeprecated: false,
      isEnabled: true,
      isHidden: false,
      modelId,
      name: modelId,
      providerId: AIHUBMIX_PROVIDER_NAME,
      supportsStreaming: true,
    };

    if (isOpenAILLMModel(model)) {
      return isOpenAIChatCompletionOnlyModel(model)
        ? createOpenAIChatModel(modelId)
        : createResponsesModel(modelId);
    }
    return createOpenAICompatibleChatModel(modelId);
  };

  const provider = Object.assign((modelId: string) => createChatModel(modelId), {
    specificationVersion: 'v3' as const,
    languageModel: createChatModel,
    embeddingModel: (modelId: string) =>
      new OpenAICompatibleEmbeddingModel(modelId, {
        provider: `${AIHUBMIX_PROVIDER_NAME}.embedding`,
        url,
        headers: authHeaders,
        fetch: customFetch,
      }),
    imageModel: (modelId: string) =>
      new OpenAICompatibleImageModel(modelId, {
        provider: `${AIHUBMIX_PROVIDER_NAME}.image`,
        url,
        headers: authHeaders,
        fetch: customFetch,
      }),
  }) as AihubmixProvider;

  return provider;
}
