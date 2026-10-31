import {
  getProviderBaseUrlIssue,
  normalizeVertexCredentials,
  resolveVertexUrls,
} from '@cherrystudio/ai-runtime/provider';

import { CLOUD_PROVIDER_ID } from '@/shared/contracts/cloud';
import type { ProviderConfigurationIssue } from '@/shared/contracts/providers';
import { getPiOAuthProviderId } from '@/shared/data/providerOAuth';
import type { ApiKeyEntry, AuthConfig, Provider } from '@/shared/data/types/provider';
import { VertexAuthFieldsSchema } from '@/shared/utils/vertexAuth';

/** Validate stored connection facts without probing the network or rejecting configured cloud auth. */
export function getProviderConfigurationIssue(
  provider: Provider,
  keys: readonly ApiKeyEntry[],
  auth?: AuthConfig | null,
  oauthSignedIn = false,
): ProviderConfigurationIssue | null {
  if (provider.id === CLOUD_PROVIDER_ID) return null;
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
      const fields = VertexAuthFieldsSchema.safeParse({
        project: auth.project,
        location: auth.location,
        ...normalizeVertexCredentials(auth.credentials),
      });
      if (!fields.success) return 'invalid-service-account';
      const { project, location } = fields.data;
      try {
        for (const endpoint of Object.values(provider.endpointConfigs ?? {})) {
          resolveVertexUrls(endpoint?.baseUrl ?? '', project, location);
        }
        resolveVertexUrls('', project, location);
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
