import {
  getFromApi as aiSdkGetFromApi,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import * as z from 'zod';
import { createUniqueModelId, type Model } from '@/shared/domain/model';
import type { Provider } from '@/shared/domain/provider';

import { defaultHeaders, formatApiHost, getBaseUrl } from '../utils/provider';
import {
  AiHubMixModelsResponseSchema,
  GeminiModelsResponseSchema,
  NewApiModelsResponseSchema,
  OpenAIModelsResponseSchema,
  TogetherModelsResponseSchema,
  VercelGatewayModelsResponseSchema,
} from './listModelsSchemas';

type ModelFetcher = {
  match: (provider: Provider) => boolean;
  fetch: (
    provider: Provider,
    context: ModelListContext,
    signal?: AbortSignal,
    options?: { throwOnError?: boolean },
  ) => Promise<Partial<Model>[]>;
};

export interface ModelListContext {
  getRotatedApiKey(providerId: string): Promise<string>;
}

const ApiErrorSchema = z.object({
  error: z
    .object({
      message: z.string().optional(),
      code: z.string().optional(),
    })
    .optional(),
  message: z.string().optional(),
});

type ApiError = z.infer<typeof ApiErrorSchema>;
type OpenAIModelResponseItem = z.infer<typeof OpenAIModelsResponseSchema>['data'][number];

async function getFromApi<T>({
  url,
  headers,
  responseSchema,
  abortSignal,
}: {
  url: string;
  headers?: Record<string, string>;
  responseSchema: z.ZodType<T>;
  abortSignal?: AbortSignal;
}): Promise<T> {
  const { value } = await aiSdkGetFromApi({
    url,
    headers,
    successfulResponseHandler: createJsonResponseHandler(zodSchema(responseSchema)),
    failedResponseHandler: createJsonErrorResponseHandler({
      errorSchema: zodSchema(ApiErrorSchema),
      errorToMessage: (error: ApiError) => error.error?.message || error.message || 'Unknown error',
    }),
    abortSignal,
  });

  return value;
}

async function providerHeaders(
  provider: Provider,
  context: ModelListContext,
): Promise<Record<string, string>> {
  return defaultHeaders(provider, await context.getRotatedApiKey(provider.id));
}

function defaultGroup(modelId: string, providerId: string): string {
  const parts = modelId.split('/');
  return parts.length > 1 ? parts[0] : providerId;
}

function toModel(apiModelId: string, provider: Provider, extra?: Partial<Model>): Partial<Model> {
  return {
    ...extra,
    id: createUniqueModelId(provider.id, apiModelId),
    providerId: provider.id,
    apiModelId,
    modelId: apiModelId,
    name: extra?.name || apiModelId,
    group: extra?.group || defaultGroup(apiModelId, provider.id),
    description: extra?.description,
    capabilities: extra?.capabilities ?? [],
    supportsStreaming: extra?.supportsStreaming ?? true,
    isDeprecated: extra?.isDeprecated ?? false,
    isEnabled: extra?.isEnabled ?? true,
    isHidden: extra?.isHidden ?? false,
  };
}

function dedup<T>(items: T[], getId: (item: T) => string | undefined): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = getId(item)?.trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function handleOptionalModelListFailure<T>(
  error: unknown,
  options: { throwOnError?: boolean } | undefined,
): { data: T[] } {
  if (options?.throwOnError) {
    throw error;
  }
  return { data: [] };
}

function isPreset(provider: Provider, presetId: string): boolean {
  return provider.id === presetId || provider.presetProviderId === presetId;
}

function isGeminiProvider(provider: Provider): boolean {
  return (
    isPreset(provider, 'google') ||
    isPreset(provider, 'gemini') ||
    provider.defaultChatEndpoint === ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT
  );
}

function isAiGatewayProvider(provider: Provider): boolean {
  return provider.id === 'gateway' || provider.presetProviderId === 'gateway';
}

const geminiFetcher: ModelFetcher = {
  match: isGeminiProvider,
  fetch: async (provider, context, signal) => {
    let baseUrl = getBaseUrl(provider).trim().replace(/\/+$/, '');
    baseUrl = baseUrl.replace(/\/v1(beta)?$/, '');
    const apiKey = await context.getRotatedApiKey(provider.id);
    const response = await getFromApi({
      url: `${baseUrl}/v1beta/models?key=${apiKey}`,
      headers: {
        'User-Agent': 'CherryStudioMobile/1.0',
        'X-App-Name': 'CherryStudioMobile',
        ...provider.settings.extraHeaders,
      },
      responseSchema: GeminiModelsResponseSchema,
      abortSignal: signal,
    });
    return dedup(response.models, (model) => model.name).map((model) => {
      const id = model.name.startsWith('models/') ? model.name.slice(7) : model.name;
      return toModel(id, provider, {
        name: model.displayName || id,
        description: model.description,
      });
    });
  },
};

const togetherFetcher: ModelFetcher = {
  match: (provider) => isPreset(provider, 'together'),
  fetch: async (provider, context, signal) => {
    const baseUrl = formatApiHost(getBaseUrl(provider));
    const response = await getFromApi({
      url: `${baseUrl}/models`,
      headers: await providerHeaders(provider, context),
      responseSchema: TogetherModelsResponseSchema,
      abortSignal: signal,
    });
    return dedup(response, (model) => model.id).map((model) =>
      toModel(model.id, provider, {
        name: model.display_name || model.id,
        description: model.description,
        ownedBy: model.organization,
      }),
    );
  },
};

const newApiFetcher: ModelFetcher = {
  match: (provider) =>
    isPreset(provider, 'new-api') || provider.id === 'newapi' || provider.id === 'cherryin',
  fetch: async (provider, context, signal) => {
    const baseUrl = formatApiHost(getBaseUrl(provider));
    const response = await getFromApi({
      url: `${baseUrl}/models`,
      headers: await providerHeaders(provider, context),
      responseSchema: NewApiModelsResponseSchema,
      abortSignal: signal,
    });
    return dedup(response.data, (model) => model.id).map((model) =>
      toModel(model.id, provider, { ownedBy: model.owned_by }),
    );
  },
};

const openRouterFetcher: ModelFetcher = {
  match: (provider) => isPreset(provider, 'openrouter'),
  fetch: async (provider, context, signal, options) => {
    const headers = await providerHeaders(provider, context);
    const [modelsResponse, embedModelsResponse] = await Promise.all([
      getFromApi({
        url: 'https://openrouter.ai/api/v1/models',
        headers,
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal,
      }),
      getFromApi({
        url: 'https://openrouter.ai/api/v1/embeddings/models',
        headers,
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal,
      }).catch((error) => handleOptionalModelListFailure<OpenAIModelResponseItem>(error, options)),
    ]);
    const all = [...modelsResponse.data, ...embedModelsResponse.data];
    return dedup(all, (model) => model.id).map((model) =>
      toModel(model.id, provider, { ownedBy: model.owned_by }),
    );
  },
};

const aiHubMixFetcher: ModelFetcher = {
  match: (provider) => isPreset(provider, 'aihubmix'),
  fetch: async (provider, context, signal) => {
    const response = await getFromApi({
      url: 'https://aihubmix.com/api/v1/models',
      headers: await providerHeaders(provider, context),
      responseSchema: AiHubMixModelsResponseSchema,
      abortSignal: signal,
    });
    return dedup(response.data, (model) => model.model_id).map((model) =>
      toModel(model.model_id, provider, {
        name: model.model_name || model.model_id,
        description: model.desc,
      }),
    );
  },
};

const gatewayFetcher: ModelFetcher = {
  match: isAiGatewayProvider,
  fetch: async (provider, context, signal) => {
    const response = await getFromApi({
      url: 'https://ai-gateway.vercel.sh/v3/ai/config',
      headers: {
        ...(await providerHeaders(provider, context)),
        'ai-gateway-protocol-version': '0.0.1',
      },
      responseSchema: VercelGatewayModelsResponseSchema,
      abortSignal: signal,
    });
    return dedup(response.models, (model) => model.id).map((model) =>
      toModel(model.id, provider, {
        name: model.name || model.id,
        description: model.description,
        ownedBy: model.specification?.provider,
      }),
    );
  },
};

const openAICompatibleFetcher: ModelFetcher = {
  match: () => true,
  fetch: async (provider, context, signal) => {
    const baseUrl = formatApiHost(getBaseUrl(provider));
    const response = await getFromApi({
      url: `${baseUrl}/models`,
      headers: await providerHeaders(provider, context),
      responseSchema: OpenAIModelsResponseSchema,
      abortSignal: signal,
    });
    return dedup(response.data, (model) => model.id).map((model) =>
      toModel(model.id, provider, { ownedBy: model.owned_by }),
    );
  },
};

const fetchers: ModelFetcher[] = [
  aiHubMixFetcher,
  geminiFetcher,
  togetherFetcher,
  newApiFetcher,
  openRouterFetcher,
  gatewayFetcher,
  openAICompatibleFetcher,
];

const UNSUPPORTED_PROVIDERS = new Set<string>(['aws-bedrock', 'anthropic', 'voyage', 'ollama']);

function isUnsupported(provider: Provider): boolean {
  return (
    UNSUPPORTED_PROVIDERS.has(provider.id) ||
    UNSUPPORTED_PROVIDERS.has(provider.presetProviderId ?? '')
  );
}

export async function listModels(
  provider: Provider,
  context: ModelListContext,
  abortSignal?: AbortSignal,
  options?: { throwOnError?: boolean },
): Promise<Partial<Model>[]> {
  try {
    if (isUnsupported(provider)) {
      if (options?.throwOnError) {
        throw new Error(`Provider does not support model listing: ${provider.id}`);
      }
      return [];
    }

    const fetcher = fetchers.find((candidate) => candidate.match(provider));
    if (!fetcher) {
      return [];
    }
    return await fetcher.fetch(provider, context, abortSignal, options);
  } catch (error) {
    if (options?.throwOnError) {
      throw error;
    }
    return [];
  }
}
