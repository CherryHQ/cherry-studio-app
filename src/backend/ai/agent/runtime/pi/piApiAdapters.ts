import { formatApiHost, withoutTrailingApiVersion } from '@cherrystudio/ai-runtime/provider';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { AgentOptions } from '@earendil-works/pi-agent-core/agent';
import type { FetchFunction } from '@earendil-works/pi-ai';

import { applyPiRequestParameters, type PiRequestParameters } from './piRequestParameters';

export type SupportedPiApi =
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'openai-completions'
  | 'openai-responses'
  | 'azure-openai-responses';

type PiStreamFn = AgentOptions['streamFn'];

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
  if (endpointType === ENDPOINT_TYPE.OPENAI_RESPONSES && adapterFamily === 'azure-responses') {
    return AZURE_RESPONSES_ADAPTER;
  }
  return PI_API_ADAPTERS[endpointType];
}

type PiStreamBinding = {
  apiKey: string;
  fetch: FetchFunction;
  headers: Record<string, string>;
  maxRetries: number;
  maxTokens: number;
  requestParameters?: PiRequestParameters;
  temperature?: number;
  timeoutMs: number;
  azureApiVersion?: string;
};

export async function bindPiStream(
  adapter: PiApiAdapter,
  binding: PiStreamBinding,
): Promise<PiStreamFn> {
  const streamSimple = await adapter.loadStreamSimple();

  return (model, context, options) => {
    const maxTokens = options?.maxTokens ?? binding.maxTokens;
    const temperature = options?.temperature ?? binding.temperature;
    const streamOptions = {
      ...options,
      apiKey: binding.apiKey,
      ...(adapter.api === 'azure-openai-responses' && binding.azureApiVersion
        ? { azureApiVersion: binding.azureApiVersion }
        : {}),
      fetch: adapter.supportsCustomFetch ? binding.fetch : undefined,
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
      timeoutMs: binding.timeoutMs,
    } as Parameters<PiStreamFn>[2];
    return streamSimple(model, context, streamOptions);
  };
}
