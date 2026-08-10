import { OAuthServiceError } from '@/shared/oauth';

import {
  ApiKeysResponseSchema,
  CHERRYIN_CONFIG,
  CHERRYIN_PROVIDER_ID,
  resolveCherryInContext,
} from '../../CherryInOAuthConfig';
import type { OAuthRuntimeProviderDefinition } from '../types';

export function createCherryInOAuthProvider(
  fetch: typeof globalThis.fetch,
): OAuthRuntimeProviderDefinition {
  return {
    clientId: CHERRYIN_CONFIG.CLIENT_ID,
    providerId: CHERRYIN_PROVIDER_ID,
    redirect: CHERRYIN_CONFIG.REDIRECT,
    scopes: CHERRYIN_CONFIG.SCOPES,

    afterPersistTokens: async (tokenData, context) => {
      const { apiHost } = resolveCherryInContext(context);
      const response = await fetch(`${apiHost}/api/v1/oauth/tokens`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        method: 'GET',
      });

      if (!response.ok) {
        throw new OAuthServiceError(
          `Failed to fetch API keys: ${response.status}`,
          undefined,
          'ApiKeysFetchFailed',
        );
      }

      const apiKeys = ApiKeysResponseSchema.parse(await response.json())
        .filter(Boolean)
        .join(',');
      if (!apiKeys) {
        throw new OAuthServiceError('No API keys received', undefined, 'NoApiKeysReceived');
      }
      return { apiKeys };
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

    resolveEndpoints: (context) => {
      const { apiHost, oauthServer } = resolveCherryInContext(context);
      const tokenHost = context?.oauthServer ?? apiHost;
      return {
        authorizeUrl: `${oauthServer}/oauth2/auth`,
        tokenUrl: `${tokenHost}/oauth2/token`,
      };
    },
  };
}
