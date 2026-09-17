import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

const ENDPOINT_FALLBACK_ORDER: readonly EndpointType[] = [
  ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  ENDPOINT_TYPE.OPENAI_RESPONSES,
  ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
  ENDPOINT_TYPE.OLLAMA_CHAT,
];

/**
 * Resolve base URL from provider endpoint configs.
 *
 * When `preferredEndpoint` is set (e.g. from `model.endpointTypes[0]` for relay providers),
 * its config wins over `defaultChatEndpoint` so per-model routing matches the actual request path.
 */
export function getBaseUrl(provider: Provider, preferredEndpoint?: EndpointType | null): string {
  const configs = provider.endpointConfigs;
  if (!configs) return '';

  if (preferredEndpoint && configs[preferredEndpoint]?.baseUrl) {
    return configs[preferredEndpoint].baseUrl;
  }

  const ep = provider.defaultChatEndpoint;
  if (ep && configs[ep]?.baseUrl) {
    return configs[ep].baseUrl;
  }

  for (const candidate of ENDPOINT_FALLBACK_ORDER) {
    if (configs[candidate]?.baseUrl) return configs[candidate].baseUrl;
  }

  // Last-resort: any remaining config with a baseUrl (audio / embeddings /
  // rerank / image / video endpoints).
  for (const config of Object.values(configs)) {
    if (config?.baseUrl) return config.baseUrl;
  }
  return '';
}

export function getExtraHeaders(provider: Provider): Record<string, string> {
  const headers = { ...provider.settings?.extraHeaders };
  if (provider.id !== 'radeon-cloud' && provider.presetProviderId !== 'radeon-cloud') {
    return headers;
  }

  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === 'x-source') {
      delete headers[name];
    }
  }
  return { ...headers, 'X-Source': 'cherry-studio' };
}

export function isAwsBedrockProvider(provider: Provider): boolean {
  return provider.authType === 'iam-aws' || provider.authType === 'api-key-aws';
}

export function defaultHeaders(
  provider: Provider,
  apiKey = '',
  appHeaders: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return {
    ...appHeaders,
    ...(apiKey ? { Authorization: `Bearer ${apiKey}`, 'X-Api-Key': apiKey } : {}),
    ...getExtraHeaders(provider),
  };
}

export function routeToEndpoint(apiHost: string): { baseURL: string; endpoint: string } {
  const trimmedHost = (apiHost || '').trim();
  if (!trimmedHost.endsWith('#')) {
    return { baseURL: trimmedHost.replace(/\/+$/, ''), endpoint: '' };
  }
  const host = trimmedHost.slice(0, -1);
  const SUPPORTED_ENDPOINTS = [
    'chat/completions',
    'responses',
    'messages',
    'generateContent',
    'streamGenerateContent',
    'images/generations',
    'images/edits',
    'predict',
  ];
  const endpointMatch = SUPPORTED_ENDPOINTS.find(
    (ep) => host.endsWith(`/${ep}`) || host.endsWith(`:${ep}`),
  );
  if (!endpointMatch) {
    return { baseURL: host.replace(/\/+$/, ''), endpoint: '' };
  }
  const baseSegment = host.slice(0, host.length - endpointMatch.length);
  const baseURL = baseSegment.replace(/\/+$/, '').replace(/:$/, '');
  return { baseURL, endpoint: endpointMatch };
}

export function formatApiHost(baseURL = '', appendApiVersion = true, apiVersion = 'v1'): string {
  const trimmed = baseURL.trim();
  if (!trimmed) return '';
  if (trimmed.endsWith('#')) {
    // Full endpoint overrides still need their marker when routeToEndpoint runs.
    return routeToEndpoint(trimmed).endpoint ? trimmed : trimmed.slice(0, -1).replace(/\/+$/, '');
  }
  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  if (!appendApiVersion || hasApiVersion(withoutTrailingSlash)) {
    return withoutTrailingSlash;
  }
  return `${withoutTrailingSlash}/${apiVersion}`;
}

export function formatOllamaApiHost(baseURL = ''): string {
  const normalized = baseURL
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '')
    .replace(/\/api$/, '')
    .replace(/\/chat$/, '');
  return normalized ? `${normalized}/api` : '';
}

export function withoutTrailingApiVersion(baseURL = ''): string {
  return baseURL
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v\d+(?:alpha|beta)?$/i, '');
}

function hasApiVersion(value: string): boolean {
  const versionPattern = /\/v\d+(?:alpha|beta)?(?:\/|$)/i;
  try {
    return versionPattern.test(new URL(value).pathname);
  } catch {
    return versionPattern.test(value);
  }
}

export function isWithTrailingSharp(baseURL = ''): boolean {
  return baseURL.trim().endsWith('#');
}

export type ProviderBaseUrlIssue =
  | { code: 'invalid-url' }
  | { code: 'endpoint-path'; suggestedBaseUrl: string };

/** A base URL must leave request paths to the selected protocol. A trailing # disables version insertion. */
export function getProviderBaseUrlIssue(value: string): ProviderBaseUrlIssue | null {
  const baseUrl = value.trim().replace(/#$/, '');
  if (!baseUrl || /\s/.test(baseUrl)) return { code: 'invalid-url' };
  try {
    const url = new URL(baseUrl);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      return { code: 'invalid-url' };
    }
    const endpointPath = url.pathname.match(
      /\/(?:chat\/completions|responses|messages|images\/generations|images\/edits|models\/[^/]+:(?:streamGenerateContent|generateContent))\/?$/,
    );
    if (endpointPath) {
      const root = `${url.origin}${url.pathname.slice(0, endpointPath.index)}`;
      return {
        code: 'endpoint-path',
        suggestedBaseUrl: formatApiHost(root) === root ? root : `${root}#`,
      };
    }
    return null;
  } catch {
    return { code: 'invalid-url' };
  }
}

const PROVIDERS_WITHOUT_API_VERSION = new Set([
  'github',
  'copilot',
  'perplexity',
  'newapi',
  'new-api',
  'azure-openai',
]);

export function shouldAppendProviderApiVersion(
  provider?: Pick<Provider, 'id' | 'presetProviderId'>,
): boolean {
  return (
    !PROVIDERS_WITHOUT_API_VERSION.has(provider?.id ?? '') &&
    !PROVIDERS_WITHOUT_API_VERSION.has(provider?.presetProviderId ?? '')
  );
}
