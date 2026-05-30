import { useCallback, useMemo } from 'react';
import * as AuthSession from 'expo-auth-session';
import { CHERRYIN_CONFIG } from '@/config/constants';
import { CherryInOauthService } from '@/services/CherryInOauthService';
import { useDataServices } from '@/data/runtime';

const { makeRedirectUri, useAuthRequest, ResponseType } = AuthSession;

// Singleton instance managed within the hook module
let oauthServiceInstance: CherryInOauthService | null = null;

export interface UseCherryInOAuthOptions {
  oauthServer?: string;
  apiHost?: string;
}

export function useCherryInOAuth(options: UseCherryInOAuthOptions = {}) {
  const oauthServer = options.oauthServer ?? 'https://open.cherryin.ai';
  const apiHost = options.apiHost ?? oauthServer;
  const { provider } = useDataServices();

  // Get or create OAuth service singleton
  const oauth = useMemo(() => {
    if (!oauthServiceInstance) {
      oauthServiceInstance = new CherryInOauthService(provider);
    }
    return oauthServiceInstance;
  }, [provider]);

  const redirectUri = makeRedirectUri({
    scheme: 'cherrystudio',
    path: 'oauth/callback',
  });

  const [request, , promptAsync] = useAuthRequest(
    {
      clientId: CHERRYIN_CONFIG.CLIENT_ID,
      redirectUri,
      responseType: ResponseType.Code,
      scopes: CHERRYIN_CONFIG.SCOPES.split(' '),
      usePKCE: true,
    },
    {
      authorizationEndpoint: `${oauthServer}/oauth2/auth`,
      tokenEndpoint: `${oauthServer}/oauth2/token`,
    },
  );

  const signIn = useCallback(async (): Promise<string> => {
    if (!request) {
      throw new Error('OAuth request is not ready');
    }

    const result = await promptAsync();

    if (result.type !== 'success') {
      throw new Error(result.type === 'cancel' ? 'User cancelled' : 'OAuth failed');
    }

    if (!request.codeVerifier) {
      throw new Error('PKCE code verifier is missing');
    }

    return oauth.completeOAuth({
      oauthServer,
      apiHost,
      code: result.params.code,
      codeVerifier: request.codeVerifier,
      redirectUri,
    });
  }, [request, promptAsync, oauth, oauthServer, apiHost, redirectUri]);

  return {
    signIn,
    isReady: !!request,
  };
}
