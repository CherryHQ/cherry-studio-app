import {
  getProviderBaseUrlIssue,
  normalizeVertexCredentials,
  resolveVertexUrls,
} from '@cherrystudio/ai-runtime/provider';

import type { ProviderConfigurationIssue } from '@/shared/contracts/providers';
import { getPiOAuthProviderId } from '@/shared/data/providerOAuth';
import type { ApiKeyEntry, AuthConfig, Provider } from '@/shared/data/types/provider';

/** Validate stored connection facts without probing the network or rejecting configured cloud auth. */
export function getProviderConfigurationIssue(
  provider: Provider,
  keys: readonly ApiKeyEntry[],
  auth?: AuthConfig | null,
  oauthSignedIn = false,
): ProviderConfigurationIssue | null {
  const supportsOAuth = Boolean(getPiOAuthProviderId(provider));
  if (
    supportsOAuth &&
    !oauthSignedIn &&
    provider.authMethods?.length &&
    !provider.authMethods.includes('api-key')
  )
    return 'missing-oauth';
  if (
    provider.authType === 'api-key' &&
    !supportsOAuth &&
    provider.authMethods?.length &&
    !provider.authMethods.includes('api-key')
  )
    return 'unsupported-auth';
  switch (provider.authType) {
    case 'iam-aws':
      return auth?.type === 'iam-aws' &&
        auth.region.trim() &&
        auth.accessKeyId?.trim() &&
        auth.secretAccessKey?.trim()
        ? null
        : 'unsupported-auth';
    case 'iam-gcp': {
      if (auth?.type !== 'iam-gcp') return 'invalid-service-account';
      if (
        !/^[a-zA-Z0-9][a-zA-Z0-9:.-]*$/.test(auth.project.trim()) ||
        !/^[a-z][a-z0-9-]*$/.test(auth.location.trim())
      )
        return 'invalid-service-account';
      const { clientEmail, privateKey } = normalizeVertexCredentials(auth.credentials);
      if (
        !clientEmail ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail) ||
        !privateKey ||
        !/^-----BEGIN PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]+\s+-----END PRIVATE KEY-----$/.test(
          privateKey,
        )
      ) {
        return 'invalid-service-account';
      }
      try {
        for (const endpoint of Object.values(provider.endpointConfigs ?? {})) {
          resolveVertexUrls(endpoint?.baseUrl ?? '', auth.project.trim(), auth.location.trim());
        }
        resolveVertexUrls('', auth.project.trim(), auth.location.trim());
        return null;
      } catch {
        return 'invalid-endpoint';
      }
    }
    case 'api-key-aws':
      if (auth?.type !== 'api-key-aws' || !auth.region.trim()) return 'unsupported-auth';
      break;
    case 'iam-azure':
      if (auth?.type !== 'iam-azure' || !auth.apiVersion.trim()) return 'unsupported-auth';
      break;
  }

  if (!provider.authOptional && !oauthSignedIn) {
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
  return !baseUrl || getProviderBaseUrlIssue(baseUrl) ? 'invalid-endpoint' : null;
}
