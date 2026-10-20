import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleEmbeddingModel,
} from '@ai-sdk/openai-compatible';
import {
  type EmbeddingModelV3,
  type LanguageModelV3,
  NoSuchModelError,
  type ProviderV3,
} from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { loadApiKey, withoutTrailingSlash } from '@ai-sdk/provider-utils';

export const MOONSHOT_PROVIDER_NAME = 'moonshot' as const;

export interface MoonshotProviderSettings {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
  includeUsage?: boolean;
}

export interface MoonshotProvider extends ProviderV3 {
  (modelId: string): LanguageModelV3;
  languageModel(modelId: string): LanguageModelV3;
  chatModel(modelId: string): LanguageModelV3;
  embeddingModel(modelId: string): EmbeddingModelV3;
  textEmbeddingModel(modelId: string): EmbeddingModelV3;
}

export function createMoonshotProvider(settings: MoonshotProviderSettings = {}): MoonshotProvider {
  const { baseURL = 'https://api.moonshot.cn/v1', fetch: customFetch } = settings;
  const url = ({ path }: { path: string; modelId: string }) =>
    `${withoutTrailingSlash(baseURL)}${path}`;
  const headers = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: settings.apiKey,
      environmentVariableName: 'MOONSHOT_API_KEY',
      description: 'Moonshot',
    })}`,
    ...settings.headers,
  });

  const createChatModel = (modelId: string) =>
    new OpenAICompatibleChatLanguageModel(modelId, {
      provider: `${MOONSHOT_PROVIDER_NAME}.chat`,
      url,
      headers,
      fetch: customFetch,
      includeUsage: settings.includeUsage,
    });

  const createEmbeddingModel = (modelId: string) =>
    new OpenAICompatibleEmbeddingModel(modelId, {
      provider: `${MOONSHOT_PROVIDER_NAME}.embedding`,
      url,
      headers,
      fetch: customFetch,
    });

  const provider = (modelId: string) => createChatModel(modelId);
  provider.specificationVersion = 'v3' as const;
  provider.languageModel = createChatModel;
  provider.chatModel = createChatModel;
  provider.embeddingModel = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider as MoonshotProvider;
}
