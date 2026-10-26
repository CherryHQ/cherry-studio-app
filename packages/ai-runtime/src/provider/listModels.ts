/**
 * Model listing service for Main process (v2 types).
 *
 * Uses Strategy Registry pattern: first matching fetcher wins.
 * All HTTP calls use @ai-sdk/provider-utils for consistent error handling.
 */

import {
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getFromApi as aiSdkGetFromApi,
  withoutTrailingSlash,
  zodSchema,
} from '@ai-sdk/provider-utils';
import type { EndpointType, Model } from '@cherrystudio/universal/data/types/model';
import {
  createUniqueModelId,
  ENDPOINT_TYPE,
  endpointImpliedCapability,
  MODEL_CAPABILITY,
} from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { deriveModelGroupName } from '@cherrystudio/universal/utils/model';
import * as z from 'zod';

import { defaultHeaders, formatApiHost, getBaseUrl } from '../utils/provider';
import { COPILOT_DEFAULT_HEADERS } from './constants';
import {
  emitProviderRuntimeDiagnostic,
  type ProviderRuntimeDiagnostic,
  type ProviderRuntimeDiagnostics,
} from './diagnostics';
import {
  createVertexModelListRequest,
  DEFAULT_VERTEX_MODEL_PUBLISHERS,
  getVertexModelId,
  getVertexModelPublisher,
  isSupportedVertexPublisherModel,
  type VertexModelListContext,
} from './listModels/vertex';
import {
  AIHubMixModelsResponseSchema,
  AnthropicModelsResponseSchema,
  CopilotModelsResponseSchema,
  GeminiModelsResponseSchema,
  GitHubModelsResponseSchema,
  NewApiModelsResponseSchema,
  OllamaTagsResponseSchema,
  OpenAIModelsResponseSchema,
  OVMSConfigResponseSchema,
  TogetherModelsResponseSchema,
  VercelGatewayModelsResponseSchema,
  VertexPublisherModelsResponseSchema,
} from './listModelsSchemas';
import { isVertexMaasModelId } from './vertex';

// ── Types ──

export type ModelListDiagnostic = ProviderRuntimeDiagnostic;

export interface ModelListContext extends VertexModelListContext {
  appHeaders?: Readonly<Record<string, string>>;
  getCopilotToken?: (headers: Record<string, string>, signal?: AbortSignal) => Promise<string>;
  getRotatedApiKey: (providerId: string) => Promise<string> | string;
  diagnostics?: ProviderRuntimeDiagnostics;
}

type ModelFetcher = {
  match: (provider: Provider) => boolean;
  fetch: (
    provider: Provider,
    context: ModelListContext,
    signal?: AbortSignal,
    options?: { throwOnError?: boolean },
  ) => Promise<Partial<Model>[]>;
};

function emitDiagnostic(context: ModelListContext, diagnostic: ModelListDiagnostic): void {
  emitProviderRuntimeDiagnostic(context.diagnostics, diagnostic);
}

function handleOptionalModelListFailure<T>(
  error: unknown,
  options: { throwOnError?: boolean } | undefined,
  details: { endpoint: string; providerId: string },
  context: ModelListContext,
): { data: T[] } {
  if (options?.throwOnError) {
    throw error;
  }

  return recoverOptionalModelListFailure(error, details, context);
}

function recoverOptionalModelListFailure<T>(
  error: unknown,
  details: { endpoint: string; providerId: string },
  context: ModelListContext,
): { data: T[] } {
  emitDiagnostic(context, {
    code: 'optional-model-list-failed',
    ...details,
    error,
  });
  return { data: [] };
}

// ── API Layer ──

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

/** Build default headers with rotated API key */

function defaultGroup(modelId: string, providerId: string): string {
  return deriveModelGroupName(modelId) ?? providerId;
}

function matchesPreset(provider: Provider, presetId: string): boolean {
  return provider.id === presetId || provider.presetProviderId === presetId;
}

function isOllamaProvider(provider: Provider): boolean {
  return (
    matchesPreset(provider, 'ollama') || provider.defaultChatEndpoint === ENDPOINT_TYPE.OLLAMA_CHAT
  );
}

function isGeminiProvider(provider: Provider): boolean {
  if (provider.authType === 'iam-gcp') return false;
  return (
    matchesPreset(provider, 'gemini') ||
    matchesPreset(provider, 'google') ||
    provider.defaultChatEndpoint === ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT
  );
}

function isVertexProvider(provider: Provider): boolean {
  return provider.authType === 'iam-gcp' || matchesPreset(provider, 'vertexai');
}

function isAIGatewayProvider(provider: Provider): boolean {
  return matchesPreset(provider, 'gateway');
}

async function providerHeaders(
  provider: Provider,
  context: ModelListContext,
): Promise<Record<string, string>> {
  return defaultHeaders(provider, await context.getRotatedApiKey(provider.id), context.appHeaders);
}

/** Build a partial v2 Model from API response */
function toModel(apiModelId: string, provider: Provider, extra?: Partial<Model>): Partial<Model> {
  return {
    id: createUniqueModelId(provider.id, apiModelId),
    providerId: provider.id,
    apiModelId,
    name: extra?.name || apiModelId,
    group: extra?.group || defaultGroup(apiModelId, provider.id),
    ownedBy: extra?.ownedBy,
    description: extra?.description,
    capabilities: [],
    supportsStreaming: true,
    isEnabled: true,
    isHidden: false,
    ...extra,
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

function pickPreferredString(values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return undefined;
}

const ollamaFetcher: ModelFetcher = {
  match: (p) => isOllamaProvider(p),
  fetch: async (provider, context, signal) => {
    const baseUrl = (withoutTrailingSlash(getBaseUrl(provider)) ?? '')
      .replace(/\/v1$/, '')
      .replace(/\/api$/, '');
    const response = await getFromApi({
      url: `${baseUrl}/api/tags`,
      headers: await providerHeaders(provider, context),
      responseSchema: OllamaTagsResponseSchema,
      abortSignal: signal,
    });
    return dedup(response.models, (m) => m.name).map((m) =>
      toModel(m.name, provider, {
        ownedBy: 'ollama',
        capabilities: m.capabilities?.includes('thinking') ? [MODEL_CAPABILITY.REASONING] : [],
      }),
    );
  },
};

const EXCLUDED_GEMINI_GENERATION_METHODS = ['predictLongRunning', 'bidiGenerateContent'] as const;

const EXCLUDED_GEMINI_MODEL_KEYWORDS = ['tts'] as const;

function isSupportedGeminiModel(
  model: z.infer<typeof GeminiModelsResponseSchema>['models'][number],
): boolean {
  const methods = model.supportedGenerationMethods ?? [];
  if (EXCLUDED_GEMINI_GENERATION_METHODS.some((method) => methods.includes(method))) {
    return false;
  }

  const id = (model.name.startsWith('models/') ? model.name.slice(7) : model.name).toLowerCase();
  return !EXCLUDED_GEMINI_MODEL_KEYWORDS.some((keyword) => id.includes(keyword));
}

const geminiFetcher: ModelFetcher = {
  match: (p) => isGeminiProvider(p),
  fetch: async (provider, context, signal) => {
    let baseUrl = withoutTrailingSlash(getBaseUrl(provider)) ?? '';
    baseUrl = baseUrl.replace(/\/v1(beta)?$/, '');
    const apiKey = await context.getRotatedApiKey(provider.id);
    // Pass the key via the `x-goog-api-key` header (same as `@ai-sdk/google`'s chat path)
    // instead of the `?key=` query param: on failure `APICallError.url` is logged, which
    // would persist the key into local logs users attach to bug reports.
    const response = await getFromApi({
      url: `${baseUrl}/v1beta/models`,
      headers: {
        ...context.appHeaders,
        'x-goog-api-key': apiKey,
        ...provider.settings?.extraHeaders,
      },
      responseSchema: GeminiModelsResponseSchema,
      abortSignal: signal,
    });
    return dedup(response.models, (m) => m.name)
      .filter(isSupportedGeminiModel)
      .map((m) => {
        const id = m.name.startsWith('models/') ? m.name.slice(7) : m.name;
        return toModel(id, provider, { name: m.displayName || id, description: m.description });
      });
  },
};

/** Vertex AI: paginate `publishers/{publisher}/models` for each default publisher
 *  (google, openai, meta, qwen, deepseek-ai, moonshotai, zai-org), then filter the
 *  union down to model families we actually run. Misconfigured providers and
 *  per-publisher request failures degrade to "no models from this publisher" with
 *  a warn log instead of failing the whole listing. */
const vertexFetcher: ModelFetcher = {
  match: (p) => isVertexProvider(p),
  fetch: async (provider, context, signal, options) => {
    const request = await createVertexModelListRequest(provider, context, {
      throwOnError: options?.throwOnError,
    });
    if (!request) return [];

    type PublisherGroup =
      | z.infer<typeof VertexPublisherModelsResponseSchema>['publisherModels']
      | null;
    let firstPublisherError: unknown;
    const publisherModelGroups = await Promise.all(
      DEFAULT_VERTEX_MODEL_PUBLISHERS.map(async (publisher): Promise<PublisherGroup> => {
        try {
          const publisherModels: z.infer<
            typeof VertexPublisherModelsResponseSchema
          >['publisherModels'] = [];
          let pageToken: string | undefined;
          do {
            const searchParams = new URLSearchParams({
              pageSize: '100',
              listAllVersions: 'true',
            });
            if (pageToken) searchParams.set('pageToken', pageToken);
            const response = await getFromApi({
              url: `${request.baseUrl}/v1beta1/publishers/${publisher}/models?${searchParams.toString()}`,
              headers: request.headers,
              responseSchema: VertexPublisherModelsResponseSchema,
              abortSignal: signal,
            });
            publisherModels.push(...response.publisherModels);
            pageToken = response.nextPageToken;
          } while (pageToken);
          return publisherModels;
        } catch (error) {
          if (firstPublisherError === undefined) {
            firstPublisherError = error;
          }
          emitDiagnostic(context, {
            code: 'vertex-publisher-failed',
            providerId: provider.id,
            publisher,
            error,
          });
          return null;
        }
      }),
    );

    if (options?.throwOnError && publisherModelGroups.some((g) => g === null)) {
      if (firstPublisherError instanceof Error) {
        throw firstPublisherError;
      }
      if (firstPublisherError !== undefined) {
        throw new Error(String(firstPublisherError));
      }
      throw new Error('One or more Vertex AI publisher requests failed');
    }

    const publisherModels = publisherModelGroups.filter((g) => g !== null).flat();

    const listedModels = dedup(publisherModels, (model) => model.name).map((model) => {
      const bareId = getVertexModelId(model.name);
      const ownedBy = getVertexModelPublisher(model.name);
      // MaaS models are served over the OpenAI-compatible endpoint, which requires the
      // `{publisher}/{model}` id form even when Google is the publisher. Native Google
      // models (Gemini/Gemma/embeddings) keep their bare id.
      const publisherModelId = `${ownedBy}/${bareId}`;
      const apiModelId = isVertexMaasModelId(publisherModelId) ? publisherModelId : bareId;
      return toModel(apiModelId, provider, {
        name: pickPreferredString([model.displayName, bareId]) || bareId,
        description: model.description,
        ownedBy,
      });
    });

    // Match against the bare model name (e.g. `gemini-2.0-flash`, `llama-4-scout-…-maas`), not
    // the `provider::model` unique id nor the publisher-prefixed apiModelId — the support
    // patterns are anchored to the model name and would reject either prefixed form.
    const filteredModels = listedModels.filter((model) => {
      const modelId = model.apiModelId ?? '';
      return (
        isSupportedVertexPublisherModel(modelId) &&
        (model.ownedBy === 'google' || isVertexMaasModelId(modelId))
      );
    });

    return filteredModels;
  },
};

const githubFetcher: ModelFetcher = {
  match: (p) => matchesPreset(p, 'github'),
  fetch: async (provider, context, signal) => {
    const headers = await providerHeaders(provider, context);
    const catalogResponse = await getFromApi({
      url: 'https://models.github.ai/catalog/models',
      headers,
      responseSchema: GitHubModelsResponseSchema,
      abortSignal: signal,
    });
    const catalogModels = catalogResponse.map((m) =>
      toModel(m.id, provider, {
        name: m.name || m.id,
        description: pickPreferredString([m.summary, m.description]),
        ownedBy: m.publisher,
      }),
    );
    return dedup(catalogModels, (m) => m.apiModelId);
  },
};

const copilotFetcher: ModelFetcher = {
  match: (p) => matchesPreset(p, 'copilot'),
  fetch: async (provider, context, signal) => {
    const copilotHeaders = {
      ...COPILOT_DEFAULT_HEADERS,
      ...provider.settings.extraHeaders,
    };
    // getToken exchanges the stored GitHub OAuth token for a Copilot session token.
    // It must NOT carry the provider's `Authorization: Bearer <apiKey>` (added by
    // defaultHeaders) — GitHub's token endpoint rejects the conflicting header with 401.
    if (!context.getCopilotToken) {
      throw new Error('Copilot model listing requires a token provider');
    }
    const token = await context.getCopilotToken(copilotHeaders, signal);
    const response = await getFromApi({
      url: `${withoutTrailingSlash(getBaseUrl(provider, ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS))}/models`,
      headers: {
        ...copilotHeaders,
        Authorization: `Bearer ${token}`,
      },
      responseSchema: CopilotModelsResponseSchema,
      abortSignal: signal,
    });

    const filtered = response.data.filter((m) => {
      const modelId = m.id.toLowerCase();
      return (
        m.policy?.state !== 'disabled' &&
        !/^accounts\/[^/]+\/routers\//.test(modelId) &&
        !/^(tts|whisper|speech)/.test(modelId.split('/').pop() || '')
      );
    });

    return dedup(filtered, (m) => m.id).map((m) =>
      toModel(m.id, provider, { ownedBy: m.owned_by }),
    );
  },
};

const ovmsFetcher: ModelFetcher = {
  match: (p) => matchesPreset(p, 'ovms'),
  fetch: async (provider, context, signal) => {
    const baseUrl = formatApiHost(
      (withoutTrailingSlash(getBaseUrl(provider)) ?? '').replace(/\/v1$/, ''),
      true,
      'v1',
    );
    const response = await getFromApi({
      url: `${baseUrl}/config`,
      headers: await providerHeaders(provider, context),
      responseSchema: OVMSConfigResponseSchema,
      abortSignal: signal,
    });
    const entries = Object.entries(response).filter(([, info]) =>
      info?.model_version_status?.some((v) => v?.state === 'AVAILABLE'),
    );
    return dedup(entries, ([name]) => name).map(([name]) =>
      toModel(name, provider, { ownedBy: 'ovms' }),
    );
  },
};

const togetherFetcher: ModelFetcher = {
  match: (p) => matchesPreset(p, 'together'),
  fetch: async (provider, context, signal) => {
    const baseUrl = formatApiHost(getBaseUrl(provider));
    const response = await getFromApi({
      url: `${baseUrl}/models`,
      headers: await providerHeaders(provider, context),
      responseSchema: TogetherModelsResponseSchema,
      abortSignal: signal,
    });
    return dedup(response, (m) => m.id).map((m) =>
      toModel(m.id, provider, {
        name: m.display_name || m.id,
        description: m.description,
        ownedBy: m.organization,
      }),
    );
  },
};

type NewApiModelResponseItem = z.infer<typeof NewApiModelsResponseSchema>['data'][number];

const ENDPOINT_TYPE_ALIASES: Record<string, EndpointType> = {
  anthropic: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  embeddings: ENDPOINT_TYPE.OPENAI_EMBEDDINGS,
  gemini: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
  'image-edit': ENDPOINT_TYPE.OPENAI_IMAGE_EDIT,
  'image-generation': ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION,
  'jina-rerank': ENDPOINT_TYPE.JINA_RERANK,
  openai: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  'openai-response': ENDPOINT_TYPE.OPENAI_RESPONSES,
  'openai-response-compact': ENDPOINT_TYPE.OPENAI_RESPONSES,
  'openai-video': ENDPOINT_TYPE.OPENAI_VIDEO_GENERATION,
};
const ENDPOINT_TYPE_VALUES = new Set<string>(Object.values(ENDPOINT_TYPE));

function normalizeEndpointTypes(values: string[] | undefined): EndpointType[] | undefined {
  if (!values?.length) {
    return undefined;
  }

  const endpointTypes = dedup(
    values
      .map((value) => {
        const normalized = value.trim().toLowerCase();
        return (
          ENDPOINT_TYPE_ALIASES[normalized] ??
          (ENDPOINT_TYPE_VALUES.has(normalized) ? (normalized as EndpointType) : undefined)
        );
      })
      .filter((value): value is EndpointType => Boolean(value)),
    (value) => value,
  );

  return endpointTypes.length > 0 ? endpointTypes : undefined;
}

const newApiFetcher: ModelFetcher = {
  match: (p) =>
    p.id === 'new-api' ||
    p.presetProviderId === 'new-api' ||
    p.id === 'cherryin' ||
    p.id === 'aionly',
  fetch: async (provider, context, signal) => {
    const baseUrl = formatApiHost(getBaseUrl(provider));
    const response = await getFromApi({
      url: `${baseUrl}/models`,
      headers: await providerHeaders(provider, context),
      responseSchema: NewApiModelsResponseSchema,
      abortSignal: signal,
    });
    return dedup(response.data, (m) => m.id).map((m: NewApiModelResponseItem) => {
      const endpointTypes = normalizeEndpointTypes(m.supported_endpoint_types);
      const impliedCapability = endpointImpliedCapability(endpointTypes?.[0]);

      return toModel(m.id, provider, {
        ownedBy: m.owned_by,
        endpointTypes,
        ...(impliedCapability ? { capabilities: [impliedCapability] } : {}),
      });
    });
  },
};

const openRouterFetcher: ModelFetcher = {
  match: (p) => matchesPreset(p, 'openrouter'),
  fetch: async (provider, context, signal, options) => {
    const headers = await providerHeaders(provider, context);
    const modelsApiUrls =
      provider.endpointConfigs?.[ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]?.modelsApiUrls;
    const [modelsResponse, embedModelsResponse, imageModelsResponse] = await Promise.all([
      getFromApi({
        url: modelsApiUrls?.default ?? 'https://openrouter.ai/api/v1/models',
        headers,
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal,
      }),
      getFromApi({
        url: modelsApiUrls?.embedding ?? 'https://openrouter.ai/api/v1/embeddings/models',
        headers,
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal,
      }).catch((error) =>
        handleOptionalModelListFailure<OpenAIModelResponseItem>(
          error,
          options,
          {
            providerId: provider.id,
            endpoint: 'openrouter-embedding-models',
          },
          context,
        ),
      ),
      getFromApi({
        url: modelsApiUrls?.image ?? 'https://openrouter.ai/api/v1/images/models',
        headers,
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal,
      }).catch((error) =>
        recoverOptionalModelListFailure<OpenAIModelResponseItem>(
          error,
          {
            providerId: provider.id,
            endpoint: 'openrouter-image-models',
          },
          context,
        ),
      ),
    ]);
    const imageModelsById = new Map(imageModelsResponse.data.map((model) => [model.id, model]));
    const all = [...modelsResponse.data, ...embedModelsResponse.data, ...imageModelsResponse.data];
    return dedup(all, (m) => m.id).map((m) => {
      const imageModel = imageModelsById.get(m.id);
      return toModel(m.id, provider, {
        name: imageModel?.name ?? m.name,
        ownedBy: m.owned_by,
        ...(imageModel
          ? {
              capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
              endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
            }
          : {}),
      });
    });
  },
};

const ppioFetcher: ModelFetcher = {
  match: (p) => matchesPreset(p, 'ppio'),
  fetch: async (provider, context, signal, options) => {
    const baseUrl = formatApiHost(getBaseUrl(provider));
    const headers = await providerHeaders(provider, context);
    const [chat, embed, reranker] = await Promise.all([
      getFromApi({
        url: `${baseUrl}/models`,
        headers,
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal,
      }),
      getFromApi({
        url: `${baseUrl}/models?model_type=embedding`,
        headers,
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal,
      }).catch((error) =>
        handleOptionalModelListFailure<OpenAIModelResponseItem>(
          error,
          options,
          {
            providerId: provider.id,
            endpoint: 'ppio-embedding-models',
          },
          context,
        ),
      ),
      getFromApi({
        url: `${baseUrl}/models?model_type=reranker`,
        headers,
        responseSchema: OpenAIModelsResponseSchema,
        abortSignal: signal,
      }).catch((error) =>
        handleOptionalModelListFailure<OpenAIModelResponseItem>(
          error,
          options,
          {
            providerId: provider.id,
            endpoint: 'ppio-reranker-models',
          },
          context,
        ),
      ),
    ]);
    const modelsById = new Map<string, Partial<Model>>();
    const mergeModel = (
      model: OpenAIModelResponseItem,
      capability?: (typeof MODEL_CAPABILITY.RERANK)[],
    ) => {
      const id = model.id?.trim();
      if (!id) return;

      const existing = modelsById.get(id);
      if (!existing) {
        modelsById.set(
          id,
          toModel(id, provider, { ownedBy: model.owned_by, capabilities: capability ?? [] }),
        );
        return;
      }

      if (capability) {
        existing.capabilities = Array.from(
          new Set([...(existing.capabilities ?? []), ...capability]),
        );
      }
    };

    for (const model of chat.data) mergeModel(model);
    for (const model of embed.data) mergeModel(model);
    for (const model of reranker.data) mergeModel(model, [MODEL_CAPABILITY.RERANK]);

    return Array.from(modelsById.values());
  },
};

const aiHubMixFetcher: ModelFetcher = {
  match: (p) => matchesPreset(p, 'aihubmix'),
  fetch: async (provider, context, signal) => {
    const response = await getFromApi({
      url: `${(withoutTrailingSlash(getBaseUrl(provider)) ?? '').replace(/\/v1$/, '')}/api/v1/models`,
      headers: await providerHeaders(provider, context),
      responseSchema: AIHubMixModelsResponseSchema,
      abortSignal: signal,
    });
    return dedup(response.data, (m) => m.model_id).map((m) =>
      toModel(m.model_id, provider, {
        name: m.model_name || m.model_id,
        description: m.desc,
      }),
    );
  },
};

/** Vercel AI Gateway: hits /v3/ai/config directly with `ai-gateway-protocol-version` header
 *  instead of going through `@ai-sdk/gateway`'s `getAvailableModels()`. The SDK validates the
 *  response against a strict schema that breaks whenever Vercel evolves the registry, so we
 *  parse with `z.looseObject` here to keep listing resilient. Inference still uses the SDK. */
const gatewayFetcher: ModelFetcher = {
  match: (p) => isAIGatewayProvider(p),
  fetch: async (provider, context, signal) => {
    const response = await getFromApi({
      url: `https://ai-gateway.vercel.sh/v3/ai/config`,
      headers: {
        ...(await providerHeaders(provider, context)),
        'ai-gateway-protocol-version': '0.0.1',
      },
      responseSchema: VercelGatewayModelsResponseSchema,
      abortSignal: signal,
    });
    return dedup(response.models, (m) => m.id).map((m) =>
      toModel(m.id, provider, {
        name: m.name || m.id,
        description: m.description,
        ownedBy: m.specification?.provider,
      }),
    );
  },
};

const EXCLUDED_OPENAI_MODEL_KEYWORDS = [
  'tts',
  'whisper',
  'transcribe',
  'speech',
  'audio',
  'realtime',
  'sora',
] as const;

function isSupportedOpenAIModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return !EXCLUDED_OPENAI_MODEL_KEYWORDS.some((keyword) => id.includes(keyword));
}

// Anthropic authenticates model listing with `x-api-key` + `anthropic-version`, not
// `Authorization: Bearer` — the generic OpenAI fetcher's Bearer header would 401. `/v1/models`
// only returns chat models (no audio/tts), and `limit` maxes at 1000, well above the catalog
// size, so a single page covers it.
const ANTHROPIC_VERSION = '2023-06-01';

const anthropicFetcher: ModelFetcher = {
  match: (p) => matchesPreset(p, 'anthropic'),
  fetch: async (provider, context, signal) => {
    const baseUrl = formatApiHost(getBaseUrl(provider));
    const apiKey = await context.getRotatedApiKey(provider.id);
    const response = await getFromApi({
      url: `${baseUrl}/models?limit=1000`,
      headers: {
        ...context.appHeaders,
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        ...provider.settings?.extraHeaders,
      },
      responseSchema: AnthropicModelsResponseSchema,
      abortSignal: signal,
    });
    return dedup(response.data, (m) => m.id).map((m) =>
      toModel(m.id, provider, { name: m.display_name || m.id, ownedBy: 'anthropic' }),
    );
  },
};

const jinaFetcher: ModelFetcher = {
  match: (p) => matchesPreset(p, 'jina'),
  fetch: async (provider, context, signal) => {
    const baseUrl = formatApiHost(getBaseUrl(provider));
    const response = await getFromApi({
      url: `${baseUrl}/models`,
      headers: await providerHeaders(provider, context),
      responseSchema: OpenAIModelsResponseSchema,
      abortSignal: signal,
    });
    return dedup(response.data, (m) => m.id).map((m) => {
      const apiModelId = m.id.replace(/^jina-ai\//, '');
      return toModel(apiModelId, provider, { name: m.name || apiModelId, ownedBy: m.owned_by });
    });
  },
};

const openAIFetcher: ModelFetcher = {
  match: (p) => matchesPreset(p, 'openai'),
  fetch: async (provider, context, signal) => {
    const baseUrl = formatApiHost(getBaseUrl(provider));
    const response = await getFromApi({
      url: `${baseUrl}/models`,
      headers: await providerHeaders(provider, context),
      responseSchema: OpenAIModelsResponseSchema,
      abortSignal: signal,
    });
    return dedup(response.data, (m) => m.id)
      .filter((m) => isSupportedOpenAIModel(m.id))
      .map((m) => toModel(m.id, provider, { ownedBy: m.owned_by }));
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
    return dedup(response.data, (m) => m.id).map((m) =>
      toModel(m.id, provider, {
        name: m.name || m.id,
        ownedBy: m.owned_by,
      }),
    );
  },
};

// ── Registry (order matters: first match wins) ──

const fetchers: ModelFetcher[] = [
  aiHubMixFetcher,
  ollamaFetcher,
  geminiFetcher,
  vertexFetcher,
  githubFetcher,
  copilotFetcher,
  ovmsFetcher,
  togetherFetcher,
  newApiFetcher,
  openRouterFetcher,
  ppioFetcher,
  gatewayFetcher,
  anthropicFetcher,
  jinaFetcher,
  openAIFetcher,
  openAICompatibleFetcher, // always-match fallback, must be last
];

// ── Public API ──

export async function listModels(
  provider: Provider,
  context: ModelListContext,
  abortSignal?: AbortSignal,
  options?: { throwOnError?: boolean },
): Promise<Partial<Model>[]> {
  try {
    const fetcher = fetchers.find((f) => f.match(provider))!;
    return await fetcher.fetch(provider, context, abortSignal, options);
  } catch (error) {
    emitDiagnostic(context, { code: 'model-list-failed', error, providerId: provider.id });
    if (options?.throwOnError) {
      throw error;
    }
    return [];
  }
}
