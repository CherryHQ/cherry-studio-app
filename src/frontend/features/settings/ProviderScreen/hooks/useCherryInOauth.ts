import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as AuthSession from 'expo-auth-session';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAlert } from '@/frontend/components/AlertProvider';
import { queryKeys, useBackendModule, useQuery } from '@/frontend/data';
import type { CompleteOAuthAuthorizationInput } from '@/shared/contracts';
import { resolveAuthorizeConfig } from '@/shared/oauth';
import { CHERRYIN_PROVIDER_ID } from '@/shared/oauth/providers/cherryin';

const { makeRedirectUri, useAuthRequest, ResponseType } = AuthSession;

// Endpoints, client id and scopes all come from the shared OAuth registry, so
// this screen holds no CherryIN host of its own.
const authorizeConfig = resolveAuthorizeConfig(CHERRYIN_PROVIDER_ID);

export class UserCancelledError extends Error {
  constructor() {
    super('User cancelled');
    this.name = 'UserCancelledError';
  }
}

export interface UseCherryInOauthOptions {
  providerId: string;
  requestConfirmation: (options: { title: string; message: string; onConfirm: () => void }) => void;
  onOAuthComplete?: () => void;
}

export function useCherryInOauth(options: UseCherryInOauthOptions) {
  const { providerId, requestConfirmation, onOAuthComplete } = options;
  const { t } = useTranslation();
  const { alert } = useAlert();
  const oauth = useBackendModule('oauth');
  const cherryin = useBackendModule('cherryin');
  const queryClient = useQueryClient();

  // Provider & auth config queries

  const providerQuery = useQuery('/providers/:id', {
    enabled: Boolean(providerId),
    params: { id: providerId },
    retry: false,
  });
  const provider = providerQuery.data;

  const authConfigQuery = useQuery('/providers/:id/auth', {
    enabled: Boolean(providerId),
    params: { id: providerId },
    retry: false,
  });
  const hasOAuthToken =
    authConfigQuery.data?.type === 'oauth' && Boolean(authConfigQuery.data.accessToken);

  // Mutations

  const logoutMutation = useMutation({
    mutationFn: () => oauth.logout(CHERRYIN_PROVIDER_ID),
    onSuccess: () => invalidateOAuthQueries(queryClient, providerId),
  });

  const completeOAuthMutation = useMutation({
    mutationFn: (input: Omit<CompleteOAuthAuthorizationInput, 'providerId'>) =>
      oauth.completeAuthorization({ ...input, providerId: CHERRYIN_PROVIDER_ID }),
    onSuccess: () => invalidateOAuthQueries(queryClient, providerId),
  });

  // Sign-in (expo-auth-session owns PKCE, the browser round-trip and the
  // `state` check; the backend owns the token exchange).

  const redirectUri = makeRedirectUri(authorizeConfig.redirect);

  const [request, , promptAsync] = useAuthRequest(
    {
      clientId: authorizeConfig.clientId,
      redirectUri,
      responseType: ResponseType.Code,
      scopes: authorizeConfig.scopes.split(' '),
      usePKCE: true,
    },
    { authorizationEndpoint: authorizeConfig.authorizeUrl },
  );

  const isReady = !!request;

  // Balance state

  const [balance, setBalance] = useState<number | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const hasAutoFetchedRef = useRef(false);

  // Actions

  const fetchData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const result = await cherryin.getBalance();
      setBalance(result?.balance ?? null);
    } catch (error) {
      console.error('[CherryIN] fetchData failed:', error);
      setBalance(null);
    }

    setIsLoadingData(false);
  }, [cherryin]);

  const handleLogout = useCallback(() => {
    requestConfirmation({
      title: t('settings.provider.oauth.cherryIn.logout'),
      message: t('settings.provider.oauth.cherryIn.logout_confirm'),
      onConfirm: async () => {
        setIsLoggingOut(true);
        try {
          await logoutMutation.mutateAsync();
          setBalance(null);
          await authConfigQuery.refetch();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          alert.show({
            description: message,
            title: t('settings.provider.oauth.cherryIn.logout_warning'),
          });
        }

        setIsLoggingOut(false);
      },
    });
  }, [alert, authConfigQuery, logoutMutation, requestConfirmation, t]);

  const handleOAuthLogin = useCallback(async () => {
    if (!request) {
      throw new Error('OAuth request is not ready');
    }

    setIsLoggingIn(true);
    const login = async () => {
      const result = await promptAsync();

      if (result.type !== 'success') {
        throw result.type === 'cancel' ? new UserCancelledError() : new Error('OAuth failed');
      }

      if (!request.codeVerifier) {
        throw new Error('PKCE code verifier is missing');
      }

      // Token exchange and credential persistence are one backend workflow.
      await completeOAuthMutation.mutateAsync({
        code: result.params.code,
        codeVerifier: request.codeVerifier,
        redirectUri,
      });

      await fetchData();

      onOAuthComplete?.();
    };
    await login().finally(() => setIsLoggingIn(false));
  }, [request, promptAsync, completeOAuthMutation, redirectUri, fetchData, onOAuthComplete]);

  // Auto-fetch balance on first login detection

  useEffect(() => {
    if (hasOAuthToken && !hasAutoFetchedRef.current) {
      hasAutoFetchedRef.current = true;
      fetchData();
    }
  }, [hasOAuthToken, fetchData]);

  return {
    // Data
    provider,
    hasOAuthToken,
    balance,
    authConfigQuery,
    providerQuery,
    // Loading states
    isReady,
    isLoadingData,
    isLoggingOut,
    isLoggingIn,
    // Actions
    handleOAuthLogin,
    handleLogout,
    fetchData,
  };
}

async function invalidateOAuthQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  providerId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.detail(providerId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.list() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.apiKeys(providerId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.authConfig(providerId) }),
  ]);
}
