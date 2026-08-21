import type { AuthConfig, Provider } from '@/shared/data/types/provider';

export function emptyAuthConfigFor(type: AuthConfig['type']): AuthConfig {
  switch (type) {
    case 'api-key-aws':
      return { region: '', type: 'api-key-aws' };
    case 'iam-aws':
      return { region: '', type: 'iam-aws' };
    case 'iam-gcp':
      return { location: '', project: '', type: 'iam-gcp' };
    case 'iam-azure':
      return { apiVersion: '', type: 'iam-azure' };
    default:
      return { type: 'api-key' };
  }
}

export function getEffectiveAuthConfig(
  authConfig: AuthConfig | null | undefined,
  provider?: Provider | null,
): AuthConfig {
  return authConfig ?? emptyAuthConfigFor(provider?.authType ?? 'api-key');
}

/**
 * `authMethods` is the registry's capability catalogue, mirrored verbatim from
 * desktop — it says what a provider *is*, not what this app implements. Only
 * `api-key` drives UI here; `oauth` and `external-cli` are information the app
 * reads past, so do not strip them from the array to "match" mobile support.
 *
 * Rows left behind by the removed OAuth sign-in were converted to `api-key`
 * by migration; the minted API keys they hold are real, working credentials.
 */
export function shouldShowApiKeys(
  authType: AuthConfig['type'],
  provider?: Pick<Provider, 'authMethods'> | null,
): boolean {
  if (provider?.authMethods?.length && !provider.authMethods.includes('api-key')) return false;
  return authType === 'api-key' || authType === 'api-key-aws';
}
