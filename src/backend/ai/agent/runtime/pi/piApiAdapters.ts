import { formatApiHost, withoutTrailingApiVersion } from '@cherrystudio/ai-runtime/provider';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { AgentOptions } from '@earendil-works/pi-agent-core/agent';
import type { FetchFunction } from '@earendil-works/pi-ai';

import type { PiLanguageEndpointType } from './piLanguageBinding';

export type SupportedPiApi =
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'openai-completions'
  | 'openai-responses';

type PiStreamFn = AgentOptions['streamFn'];

type PiApiAdapter = {
  api: SupportedPiApi;
  formatBaseUrl(baseUrl: string): string;
  loadStreamSimple(): Promise<PiStreamFn>;
  supportsCustomFetch: boolean;
};

const PI_API_ADAPTERS: Record<PiLanguageEndpointType, PiApiAdapter> = {
  [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: {
    api: 'anthropic-messages',
    formatBaseUrl: (baseUrl) => withoutTrailingApiVersion(formatApiHost(baseUrl, false)),
    loadStreamSimple: async () =>
      (await import('@earendil-works/pi-ai/api/anthropic-messages'))
        .streamSimple as unknown as PiStreamFn,
    supportsCustomFetch: true,
  },
  [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: {
    api: 'google-generative-ai',
    formatBaseUrl: (baseUrl) => formatApiHost(baseUrl, true, 'v1beta'),
    loadStreamSimple: async () =>
      (await import('@earendil-works/pi-ai/api/google-generative-ai'))
        .streamSimple as unknown as PiStreamFn,
    supportsCustomFetch: false,
  },
  [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
    api: 'openai-completions',
    formatBaseUrl: (baseUrl) => formatApiHost(baseUrl),
    loadStreamSimple: async () =>
      (await import('@earendil-works/pi-ai/api/openai-completions'))
        .streamSimple as unknown as PiStreamFn,
    supportsCustomFetch: true,
  },
  [ENDPOINT_TYPE.OPENAI_RESPONSES]: {
    api: 'openai-responses',
    formatBaseUrl: (baseUrl) => formatApiHost(baseUrl),
    loadStreamSimple: async () =>
      (await import('@earendil-works/pi-ai/api/openai-responses'))
        .streamSimple as unknown as PiStreamFn,
    supportsCustomFetch: true,
  },
};

export function resolvePiApiAdapter(endpointType: PiLanguageEndpointType): PiApiAdapter {
  return PI_API_ADAPTERS[endpointType];
}

type PiStreamBinding = {
  apiKey: string;
  fetch: FetchFunction;
  headers: Record<string, string>;
  maxRetries: number;
  maxTokens: number;
  temperature?: number;
  timeoutMs: number;
};

export async function bindPiStream(
  adapter: PiApiAdapter,
  binding: PiStreamBinding,
): Promise<PiStreamFn> {
  const streamSimple = await adapter.loadStreamSimple();

  return (model, context, options) =>
    streamSimple(model, context, {
      ...options,
      apiKey: binding.apiKey,
      fetch: adapter.supportsCustomFetch ? binding.fetch : undefined,
      headers: { ...options?.headers, ...binding.headers },
      maxRetries: binding.maxRetries,
      maxTokens: options?.maxTokens ?? binding.maxTokens,
      signal: options?.signal,
      temperature: options?.temperature ?? binding.temperature,
      timeoutMs: binding.timeoutMs,
    });
}
