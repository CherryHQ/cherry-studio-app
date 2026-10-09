import type { Provider } from '@cherrystudio/universal/data/types/provider';

export type { ProviderBaseUrlIssue } from '@cherrystudio/provider-registry';
export {
  formatApiHost,
  formatOllamaApiHost,
  getBaseUrl,
  getProviderBaseUrlIssue,
  isWithTrailingSharp,
  routeToEndpoint,
  shouldAppendProviderApiVersion,
  withoutTrailingApiVersion,
} from '@cherrystudio/provider-registry';

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
