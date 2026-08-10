import type { AuthConfig, Provider } from '@cherrystudio/universal/data/types/provider';

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
    case 'oauth':
      return { clientId: '', type: 'oauth' };
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

export function shouldShowApiKeys(
  authType: AuthConfig['type'],
  provider?: Pick<Provider, 'authMethods'> | null,
): boolean {
  if (provider?.authMethods?.length && !provider.authMethods.includes('api-key')) return false;
  return authType === 'api-key' || authType === 'api-key-aws' || authType === 'oauth';
}
