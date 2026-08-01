import * as z from 'zod';
import { OAuthServiceError } from '../errors';
import type { OAuthEndpoints, OAuthProviderContext, OAuthProviderDefinition } from '../types';

export const CHERRYIN_PROVIDER_ID = 'cherryin';

export const CHERRYIN_CONFIG = {
  ALLOWED_HOSTS: ['https://open.cherryin.ai', 'https://open.cherryin.dev'],
  CLIENT_ID: '2a348c87-bae1-4756-a62f-b2e97200fd6d',
  REDIRECT: { path: 'oauth/callback', scheme: 'cherrystudio' },
  // `offline_access` is what makes the provider issue a refresh token; without
  // it the entire refresh path below is dead weight.
  SCOPES: 'openid profile email offline_access balance:read usage:read tokens:read tokens:write',
} as const;

/**
 * Exact-match allowlist, deliberately not a prefix or suffix test: a host like
 * `https://open.cherryin.ai.evil.com` must not pass.
 */
export function validateCherryInApiHost(apiHost: string): void {
  if (!(CHERRYIN_CONFIG.ALLOWED_HOSTS as readonly string[]).includes(apiHost)) {
    throw new OAuthServiceError(`Unauthorized API host: ${apiHost}`, undefined, 'InvalidHost');
  }
}

const ApiKeyItemSchema = z
  .union([z.string(), z.object({ key: z.string() }), z.object({ token: z.string() })])
  .transform((item): string => {
    if (typeof item === 'string') return item;
    if ('key' in item) return item.key;
    return item.token;
  });

/** Tolerates all four shapes the endpoint has been seen to return. */
export const ApiKeysResponseSchema = z
  .union([z.array(ApiKeyItemSchema), z.object({ data: z.array(ApiKeyItemSchema) })])
  .transform((data): string[] => (Array.isArray(data) ? data : data.data));

export function resolveCherryInContext(context?: OAuthProviderContext): {
  apiHost: string;
  oauthServer: string;
} {
  const oauthServer = context?.oauthServer ?? CHERRYIN_CONFIG.ALLOWED_HOSTS[0];
  validateCherryInApiHost(oauthServer);

  const apiHost = context?.apiHost ?? oauthServer;
  validateCherryInApiHost(apiHost);

  return { apiHost, oauthServer };
}

async function fetchCherryInApiKeys(accessToken: string, apiHost: string): Promise<string> {
  const response = await fetch(`${apiHost}/api/v1/oauth/tokens`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    method: 'GET',
  });

  if (!response.ok) {
    throw new OAuthServiceError(
      `Failed to fetch API keys: ${response.status}`,
      undefined,
      'ApiKeysFetchFailed',
    );
  }

  const keysArray = ApiKeysResponseSchema.parse(await response.json());
  const apiKeys = keysArray.filter(Boolean).join(',');

  if (!apiKeys) {
    throw new OAuthServiceError('No API keys received', undefined, 'NoApiKeysReceived');
  }

  return apiKeys;
}

export const cherryInOAuthProvider = {
  // `clearDisablesProvider` is deliberately omitted: CherryIN can also hold a
  // manually entered API key, so logging out must not disable the provider and
  // take that key down with it.
  clientId: CHERRYIN_CONFIG.CLIENT_ID,
  providerId: CHERRYIN_PROVIDER_ID,
  redirect: CHERRYIN_CONFIG.REDIRECT,
  scopes: CHERRYIN_CONFIG.SCOPES,

  afterPersistTokens: async (tokenData, context) => {
    const { apiHost } = resolveCherryInContext(context);
    return { apiKeys: await fetchCherryInApiKeys(tokenData.access_token, apiHost) };
  },

  revokeToken: async (accessToken, context) => {
    const { apiHost } = resolveCherryInContext(context);

    await fetch(`${apiHost}/oauth2/revoke`, {
      body: new URLSearchParams({
        token: accessToken,
        token_type_hint: 'access_token',
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });
  },

  resolveEndpoints: (context?: OAuthProviderContext): OAuthEndpoints => {
    const { apiHost, oauthServer } = resolveCherryInContext(context);
    // An explicit `oauthServer` pins the token endpoint too; otherwise it
    // follows `apiHost`, which lets a caller point both at one environment.
    const tokenHost = context?.oauthServer ?? apiHost;

    return {
      authorizeUrl: `${oauthServer}/oauth2/auth`,
      tokenUrl: `${tokenHost}/oauth2/token`,
    };
  },
} satisfies OAuthProviderDefinition;
