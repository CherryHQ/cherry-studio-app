import type { ProviderConfigurationIssue } from '@/shared/contracts/providers';
import type { ApiKeyEntry, AuthConfig, Provider } from '@/shared/data/types/provider';

/** Validate stored connection facts without probing the network or rejecting configured cloud auth. */
export function getProviderConfigurationIssue(
  provider: Provider,
  keys: readonly ApiKeyEntry[],
  auth?: AuthConfig | null,
): ProviderConfigurationIssue | null {
  if (provider.authMethods?.length && !provider.authMethods.includes('api-key'))
    return 'unsupported-auth';
  switch (provider.authType) {
    case 'iam-aws':
      return auth?.type === 'iam-aws' &&
        auth.region.trim() &&
        auth.accessKeyId?.trim() &&
        auth.secretAccessKey?.trim()
        ? null
        : 'unsupported-auth';
    case 'iam-gcp':
      return auth?.type === 'iam-gcp' &&
        auth.project.trim() &&
        auth.location.trim() &&
        auth.credentials &&
        Object.keys(auth.credentials).length > 0
        ? null
        : 'unsupported-auth';
    case 'api-key-aws':
      if (auth?.type !== 'api-key-aws' || !auth.region.trim()) return 'unsupported-auth';
      break;
    case 'iam-azure':
      if (auth?.type !== 'iam-azure' || !auth.apiVersion.trim()) return 'unsupported-auth';
      break;
  }

  if (!provider.authOptional) {
    const configuredKeys = keys.filter((entry) => entry.key.trim());
    if (configuredKeys.length === 0) return 'missing-api-key';
    if (!configuredKeys.some((entry) => entry.isEnabled)) return 'disabled-api-keys';
  }

  if (provider.authType === 'api-key-aws') return null;

  const endpoint =
    provider.defaultChatEndpoint ??
    (Object.keys(provider.endpointConfigs ?? {})[0] as
      | keyof NonNullable<Provider['endpointConfigs']>
      | undefined);
  const baseUrl = endpoint ? provider.endpointConfigs?.[endpoint]?.baseUrl?.trim() : undefined;
  if (!baseUrl || /\s/.test(baseUrl) || baseUrl.endsWith('#')) return 'invalid-endpoint';
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'invalid-endpoint';
  } catch {
    return 'invalid-endpoint';
  }
  return null;
}
