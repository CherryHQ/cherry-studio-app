import { formatApiHost, withoutTrailingApiVersion } from '@cherrystudio/ai-runtime/provider';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { CacheRetention, FetchFunction } from '@earendil-works/pi-ai';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

import type { PiStreamFn } from './piModelTypes';
import { applyPiRequestParameters, type PiRequestParameters } from './piRequestParameters';

export type SupportedPiApi =
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'openai-completions'
  | 'openai-responses'
  | 'openai-codex-responses'
  | 'azure-openai-responses';

type PiApiAdapter = {
  api: SupportedPiApi;
  /** Configured headers that override or compete with the selected API key. */
  authHeaderNames: readonly string[];
  formatBaseUrl(baseUrl: string, appendApiVersion?: boolean): string;
  loadStreamSimple(): Promise<PiStreamFn>;
  supportsCustomFetch: boolean;
};

const AZURE_RESPONSES_ADAPTER: PiApiAdapter = {
  api: 'azure-openai-responses',
  authHeaderNames: ['authorization', 'api-key'],
  formatBaseUrl: (baseUrl) => formatApiHost(baseUrl, false),
  loadStreamSimple: async () =>
    (await import('@earendil-works/pi-ai/api/azure-openai-responses'))
      .streamSimple as unknown as PiStreamFn,
  supportsCustomFetch: true,
};

const PI_API_ADAPTERS = {
  [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: {
    api: 'anthropic-messages',
    authHeaderNames: ['authorization', 'x-api-key'],
    formatBaseUrl: (baseUrl) => withoutTrailingApiVersion(formatApiHost(baseUrl, false)),
    loadStreamSimple: async () =>
      (await import('@earendil-works/pi-ai/api/anthropic-messages'))
        .streamSimple as unknown as PiStreamFn,
    supportsCustomFetch: true,
  },
  [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: {
    api: 'google-generative-ai',
    authHeaderNames: ['authorization', 'x-goog-api-key'],
    formatBaseUrl: (baseUrl) => formatApiHost(baseUrl, true, 'v1beta'),
    loadStreamSimple: async () =>
      (await import('@earendil-works/pi-ai/api/google-generative-ai'))
        .streamSimple as unknown as PiStreamFn,
    supportsCustomFetch: false,
  },
  [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
    api: 'openai-completions',
    authHeaderNames: ['authorization'],
    formatBaseUrl: (baseUrl, appendApiVersion = true) => formatApiHost(baseUrl, appendApiVersion),
    loadStreamSimple: async () =>
      (await import('@earendil-works/pi-ai/api/openai-completions'))
        .streamSimple as unknown as PiStreamFn,
    supportsCustomFetch: true,
  },
  [ENDPOINT_TYPE.OPENAI_RESPONSES]: {
    api: 'openai-responses',
    authHeaderNames: ['authorization'],
    formatBaseUrl: (baseUrl, appendApiVersion = true) => formatApiHost(baseUrl, appendApiVersion),
    loadStreamSimple: async () =>
      (await import('@earendil-works/pi-ai/api/openai-responses'))
        .streamSimple as unknown as PiStreamFn,
    supportsCustomFetch: true,
  },
} satisfies Record<string, PiApiAdapter>;

export type PiLanguageEndpointType = keyof typeof PI_API_ADAPTERS;

export function isPiLanguageEndpointType(
  endpointType: string | undefined,
): endpointType is PiLanguageEndpointType {
  return endpointType !== undefined && Object.hasOwn(PI_API_ADAPTERS, endpointType);
}

export function resolvePiApiAdapter(
  endpointType: PiLanguageEndpointType,
  adapterFamily?: string,
): PiApiAdapter {
  if (endpointType === ENDPOINT_TYPE.OPENAI_RESPONSES && adapterFamily === 'openai-codex') {
    return {
      api: 'openai-codex-responses',
      authHeaderNames: ['authorization'],
      formatBaseUrl: (baseUrl) => baseUrl.replace(/\/$/, ''),
      loadStreamSimple: async () =>
        (await import('@earendil-works/pi-ai/api/openai-codex-responses'))
          .streamSimple as unknown as PiStreamFn,
      supportsCustomFetch: true,
    };
  }
  if (endpointType === ENDPOINT_TYPE.OPENAI_RESPONSES && adapterFamily === 'azure-responses') {
    return AZURE_RESPONSES_ADAPTER;
  }
  return PI_API_ADAPTERS[endpointType];
}

type PiStreamBinding = {
  apiKey?: string;
  fetch: FetchFunction;
  headers: Record<string, string>;
  maxRetries: number;
  maxTokens: number;
  requestParameters?: PiRequestParameters;
  temperature?: number;
  azureApiVersion?: string;
  cacheRetention?: CacheRetention;
  sessionId?: string;
};

/**
 * A body that fails after its headers arrived is a dropped connection. The native message is
 * OS-localized and carries no status, so Pi's retry policy cannot classify it by text; mark it
 * here. An aborted request stays terminal through its stop reason.
 */
function withRetryableBodyFailure(fetch: FetchFunction): FetchFunction {
  return async (input, init) => {
    const response = await fetch(input, init);
    const source = response.ok ? response.body : null;
    if (!source) return response;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          reader ??= source.getReader();
          try {
            const { done, value } = await reader.read();
            if (done) controller.close();
            else controller.enqueue(value);
          } catch (error) {
            if (error instanceof Error && !init?.signal?.aborted && !('code' in error))
              Object.assign(error, { code: 'stream_disconnected' });
            controller.error(
              error instanceof Error ? Object.assign(error, { retryable: true }) : error,
            );
          }
        },
        cancel: (reason) => (reader ? reader.cancel(reason) : source.cancel(reason)),
      },
      // Stay lazy: the source is locked only once the body is actually read.
      { highWaterMark: 0 },
    );
    Object.defineProperty(response, 'body', { value: body });
    return response;
  };
}

export async function bindPiStream(
  adapter: PiApiAdapter,
  binding: PiStreamBinding,
): Promise<PiStreamFn> {
  const streamSimple = await adapter.loadStreamSimple();
  const fetch = adapter.supportsCustomFetch ? withRetryableBodyFailure(binding.fetch) : undefined;

  return (model, context, options) => {
    const maxTokens = options?.maxTokens ?? binding.maxTokens;
    const temperature = options?.temperature ?? binding.temperature;
    const streamOptions = {
      ...options,
      apiKey: binding.apiKey,
      cacheRetention: binding.cacheRetention ?? options?.cacheRetention,
      sessionId: binding.sessionId ?? options?.sessionId,
      ...(adapter.api === 'openai-codex-responses' ? { transport: 'sse' } : {}),
      ...(adapter.api === 'azure-openai-responses' && binding.azureApiVersion
        ? { azureApiVersion: binding.azureApiVersion }
        : {}),
      fetch,
      headers: { ...options?.headers, ...binding.headers },
      maxRetries: binding.maxRetries,
      maxTokens,
      onPayload: async (payload, requestModel) => {
        const previous = await options?.onPayload?.(payload, requestModel);
        const resolvedPayload = previous === undefined ? payload : previous;
        return binding.requestParameters
          ? applyPiRequestParameters(
              resolvedPayload,
              adapter.api,
              binding.requestParameters,
              maxTokens,
              temperature,
            )
          : resolvedPayload;
      },
      signal: options?.signal,
      temperature,
    } as Parameters<PiStreamFn>[2];
    return streamSimple(model, normalizeContext(context), streamOptions);
  };
}
