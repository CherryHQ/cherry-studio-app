import { useCallback } from 'react';
import * as AuthSession from 'expo-auth-session';
import { CHERRYIN_CONFIG } from '@/config/constants';
import { cherryInOauthService } from '@/services/CherryInOauthService';

const { makeRedirectUri, useAuthRequest, ResponseType } = AuthSession;

export interface UseCherryInOAuthOptions {
  oauthServer?: string;
  apiHost?: string;
}

export function useCherryInOAuth(options: UseCherryInOAuthOptions = {}) {
  const oauthServer = options.oauthServer ?? 'https://open.cherryin.ai';
  const apiHost = options.apiHost ?? oauthServer;

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

    return cherryInOauthService.completeOAuth({
      oauthServer,
      apiHost,
      code: result.params.code,
      codeVerifier: request.codeVerifier,
      redirectUri,
    });
  }, [request, promptAsync, oauthServer, apiHost, redirectUri]);

  return {
    signIn,
    isReady: !!request,
  };
}
