import { formatApiHost, withoutTrailingApiVersion } from '@cherrystudio/ai-runtime/provider';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { CacheRetention, FetchFunction, ProviderHeaders } from '@earendil-works/pi-ai';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

import { piModelPayloadAttributes } from './piModelDiagnostics';
import type { PiStreamFn } from './piModelTypes';
import { applyPiRequestParameters, type PiRequestParameters } from './piRequestParameters';

export type SupportedPiApi =
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'google-vertex'
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
  if (endpointType === ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT && adapterFamily === 'google-vertex') {
    return {
      api: 'google-vertex',
      authHeaderNames: ['authorization', 'x-goog-api-key', 'x-api-key', 'api-key'],
      formatBaseUrl: (baseUrl) => baseUrl,
      loadStreamSimple: async () =>
        (await import('@earendil-works/pi-ai/api/google-vertex'))
          .streamSimple as unknown as PiStreamFn,
      supportsCustomFetch: true,
    };
  }
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
  accessToken?: string;
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

/** Native transport failures carry no code or status; an aborted request is not one. */
function withTransportCode(error: unknown, init: RequestInit | undefined, code: string): unknown {
  if (error instanceof Error && !init?.signal?.aborted && !('code' in error))
    Object.assign(error, { code });
  return error;
}

/**
 * A body that fails after its headers arrived is a dropped connection. The native message is
 * OS-localized and carries no status, so Pi's retry policy cannot classify it by text; mark it
 * here. An aborted request stays terminal through its stop reason. A request rejected before
 * headers keeps its existing retry classification and only gains a code, which Pi reads from the
 * cause of the SDK's connection error. The rejection does not say why no response arrived.
 */
function withRetryableBodyFailure(fetch: FetchFunction): FetchFunction {
  return async (input, init) => {
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      throw withTransportCode(error, init, 'no_response');
    }
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
            withTransportCode(error, init, 'stream_disconnected');
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
    const { trace, ...providerOptions } = options ?? {};
    const maxTokens = options?.maxTokens ?? binding.maxTokens;
    const temperature = options?.temperature ?? binding.temperature;
    const headers: ProviderHeaders = { ...options?.headers, ...binding.headers };
    if (binding.apiKey === '') {
      // SDKs require a key even for unauthenticated gateways. Suppress only generated auth.
      for (const name of adapter.authHeaderNames) {
        if (!Object.keys(headers).some((header) => header.toLowerCase() === name)) {
          // Google's SDK flattens null overrides; an empty key header suppresses its default.
          headers[name] =
            adapter.api === 'google-generative-ai' && name === 'x-goog-api-key' ? '' : null;
        }
      }
    }
    const streamOptions = {
      ...providerOptions,
      apiKey: binding.apiKey === '' ? 'unused' : binding.apiKey,
      ...(binding.accessToken ? { accessToken: binding.accessToken } : {}),
      cacheRetention: binding.cacheRetention ?? options?.cacheRetention,
      sessionId: binding.sessionId ?? options?.sessionId,
      ...(adapter.api === 'openai-codex-responses' ? { transport: 'sse' } : {}),
      ...(adapter.api === 'azure-openai-responses' && binding.azureApiVersion
        ? { azureApiVersion: binding.azureApiVersion }
        : {}),
      fetch,
      headers,
      maxRetries: binding.maxRetries,
      maxTokens,
      onPayload: async (payload, requestModel) => {
        const previous = await options?.onPayload?.(payload, requestModel);
        const resolvedPayload = previous === undefined ? payload : previous;
        const requestPayload = binding.requestParameters
          ? applyPiRequestParameters(
              resolvedPayload,
              adapter.api,
              binding.requestParameters,
              maxTokens,
              temperature,
            )
          : resolvedPayload;
        trace?.setAttributes(piModelPayloadAttributes(requestPayload, adapter.api));
        return requestPayload;
      },
      signal: options?.signal,
      temperature,
    } as Parameters<PiStreamFn>[2];
    return streamSimple(model, normalizeContext(context), streamOptions);
  };
}
