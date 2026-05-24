import type { AuthConfig, Provider } from '@/data/types/provider';

export type AuthDraft = {
  accessKeyId: string;
  apiVersion: string;
  clientId: string;
  credentials: string;
  deploymentId: string;
  location: string;
  project: string;
  region: string;
  secretAccessKey: string;
  type: AuthConfig['type'];
};

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

export function formatCredentialsDraft(credentials: Record<string, unknown> | undefined): string {
  return credentials ? JSON.stringify(credentials, null, 2) : '';
}

export function parseCredentialsDraft(input: string): Record<string, unknown> | undefined {
  const trimmed = input.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed: unknown = JSON.parse(trimmed);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('credentials must be a JSON object');
  }

  return parsed as Record<string, unknown>;
}

export function createAuthDraft(authConfig: AuthConfig): AuthDraft {
  return {
    accessKeyId: authConfig.type === 'iam-aws' ? (authConfig.accessKeyId ?? '') : '',
    apiVersion: authConfig.type === 'iam-azure' ? authConfig.apiVersion : '',
    clientId: authConfig.type === 'oauth' ? authConfig.clientId : '',
    credentials:
      authConfig.type === 'iam-gcp' ? formatCredentialsDraft(authConfig.credentials) : '',
    deploymentId: authConfig.type === 'iam-azure' ? (authConfig.deploymentId ?? '') : '',
    location: authConfig.type === 'iam-gcp' ? authConfig.location : '',
    project: authConfig.type === 'iam-gcp' ? authConfig.project : '',
    region:
      authConfig.type === 'iam-aws' || authConfig.type === 'api-key-aws' ? authConfig.region : '',
    secretAccessKey: authConfig.type === 'iam-aws' ? (authConfig.secretAccessKey ?? '') : '',
    type: authConfig.type,
  };
}

export function buildAuthConfigFromDraft(
  originalAuthConfig: AuthConfig | null | undefined,
  provider: Provider,
  draft: AuthDraft,
): AuthConfig {
  switch (draft.type) {
    case 'api-key-aws':
      return {
        region: draft.region.trim(),
        type: 'api-key-aws',
      };
    case 'iam-aws':
      return {
        ...(draft.accessKeyId.trim() ? { accessKeyId: draft.accessKeyId.trim() } : {}),
        region: draft.region.trim(),
        ...(draft.secretAccessKey.trim() ? { secretAccessKey: draft.secretAccessKey.trim() } : {}),
        type: 'iam-aws',
      };
    case 'iam-gcp': {
      const credentials = parseCredentialsDraft(draft.credentials);

      return {
        ...(credentials ? { credentials } : {}),
        location: draft.location.trim(),
        project: draft.project.trim(),
        type: 'iam-gcp',
      };
    }
    case 'iam-azure':
      return {
        apiVersion: draft.apiVersion.trim(),
        ...(draft.deploymentId.trim() ? { deploymentId: draft.deploymentId.trim() } : {}),
        type: 'iam-azure',
      };
    case 'oauth':
      return {
        ...(originalAuthConfig?.type === 'oauth'
          ? originalAuthConfig
          : emptyAuthConfigFor('oauth')),
        clientId: draft.clientId.trim(),
        type: 'oauth',
      };
    default:
      return originalAuthConfig?.type === 'api-key'
        ? originalAuthConfig
        : emptyAuthConfigFor(provider.authType === 'api-key' ? 'api-key' : draft.type);
  }
}

export function shouldShowApiKeys(authType: AuthConfig['type']): boolean {
  return authType === 'api-key' || authType === 'api-key-aws';
}

export function needsAuthConfigSave(authType: AuthConfig['type']): boolean {
  return authType !== 'api-key';
}

export function authConfigSignature(authConfig: AuthConfig): string {
  return JSON.stringify(authConfig);
}
