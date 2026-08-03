import { AnthropicMessagesLanguageModel } from '@ai-sdk/anthropic/internal';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GoogleGenerativeAILanguageModel } from '@ai-sdk/google/internal';
import { createOpenAI } from '@ai-sdk/openai';
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';
import type { EmbeddingModelV3, LanguageModelV3, ProviderV3 } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { EndpointType } from '@cherrystudio/universal/data/types/model';

import { formatApiHost } from '@/backend/ai/utils/provider';

import { resolveDmxapiChatFamily } from './dmxapiRouting';

export const DMXAPI_PROVIDER_NAME = 'dmxapi' as const;

export interface DmxapiProviderSettings {
  apiKey?: string;
  baseURL?: string;
  endpointBaseURLs?: Partial<Record<EndpointType, string>>;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
}

export interface DmxapiProvider extends ProviderV3 {
  (modelId: string): LanguageModelV3;
  languageModel(modelId: string): LanguageModelV3;
  embeddingModel(modelId: string): EmbeddingModelV3;
}

function withoutTrailingApiVersion(baseURL: string): string {
  return baseURL.replace(/\/v\d+(?:alpha|beta)?\/?$/i, '');
}

function isGeminiEmbeddingModel(modelId: string): boolean {
  return /^(gemini-embedding-|embedding-001|text-embedding-\d{3}(?!-))/i.test(modelId);
}

export function createDmxapiProvider(settings: DmxapiProviderSettings = {}): DmxapiProvider {
  const { baseURL, fetch: customFetch } = settings;
  if (!baseURL) {
    throw new Error('DMXAPI provider requires a non-empty `baseURL`.');
  }

  const resolveApiKey = () =>
    loadApiKey({
      apiKey: settings.apiKey,
      environmentVariableName: 'DMXAPI_API_KEY',
      description: 'DMXAPI',
    });
  const compatHeaders = () => ({
    Authorization: `Bearer ${resolveApiKey()}`,
    ...settings.headers,
  });

  const rootBaseURL = withoutTrailingApiVersion(baseURL);
  const chatBaseURL =
    settings.endpointBaseURLs?.[ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS] ??
    formatApiHost(rootBaseURL, true);
  const anthropicBaseURL =
    settings.endpointBaseURLs?.[ENDPOINT_TYPE.ANTHROPIC_MESSAGES] ??
    formatApiHost(rootBaseURL, true);
  const geminiBaseURL =
    settings.endpointBaseURLs?.[ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT] ??
    formatApiHost(rootBaseURL, true, 'v1beta');
  const chatUrl = ({ path }: { path: string; modelId: string }) =>
    `${withoutTrailingSlash(chatBaseURL)}${path}`;

  const googleProvider = () =>
    createGoogleGenerativeAI({
      baseURL: geminiBaseURL,
      apiKey: resolveApiKey(),
      headers: settings.headers,
      fetch: customFetch,
    });
  const createOpenAIChatModel = (modelId: string) =>
    createOpenAI({
      baseURL: chatBaseURL,
      apiKey: resolveApiKey(),
      headers: settings.headers,
      fetch: customFetch,
    }).chat(modelId);

  const createChatModel = (modelId: string): LanguageModelV3 => {
    switch (resolveDmxapiChatFamily(modelId)) {
      case 'anthropic':
        return new AnthropicMessagesLanguageModel(modelId, {
          provider: `${DMXAPI_PROVIDER_NAME}.anthropic`,
          baseURL: anthropicBaseURL,
          headers: () => ({ 'x-api-key': resolveApiKey(), ...settings.headers }),
          fetch: customFetch,
          supportedUrls: () => ({ 'image/*': [/^https?:\/\/.*$/] }),
          supportsNativeStructuredOutput: false,
        });
      case 'gemini':
        return new GoogleGenerativeAILanguageModel(modelId, {
          provider: `${DMXAPI_PROVIDER_NAME}.google`,
          baseURL: geminiBaseURL,
          headers: () => ({ 'x-goog-api-key': resolveApiKey(), ...settings.headers }),
          fetch: customFetch,
          generateId: () => `${DMXAPI_PROVIDER_NAME}-${Date.now()}`,
          supportedUrls: () => ({}),
        });
      case 'openai':
        return createOpenAIChatModel(modelId);
      case 'openai-compat':
        return new OpenAICompatibleChatLanguageModel(modelId, {
          provider: `${DMXAPI_PROVIDER_NAME}.chat`,
          url: chatUrl,
          headers: compatHeaders,
          fetch: customFetch,
        });
    }
  };

  return Object.assign((modelId: string) => createChatModel(modelId), {
    specificationVersion: 'v3' as const,
    languageModel: createChatModel,
    embeddingModel: (modelId: string) => {
      if (isGeminiEmbeddingModel(modelId)) {
        return googleProvider().embeddingModel(modelId);
      }
      return new OpenAICompatibleEmbeddingModel(modelId, {
        provider: `${DMXAPI_PROVIDER_NAME}.embedding`,
        url: chatUrl,
        headers: compatHeaders,
        fetch: customFetch,
      });
    },
  }) as DmxapiProvider;
}
