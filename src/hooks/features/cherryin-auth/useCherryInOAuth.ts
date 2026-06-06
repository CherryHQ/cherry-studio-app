import * as AuthSession from 'expo-auth-session';
import { useToast } from 'heroui-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CHERRYIN_CONFIG } from '@/config/constants';
import { queryKeys } from '@/data/api';
import { useDataMutation, useDataQuery } from '@/data/hooks';
import { useDataServices } from '@/data/runtime';
import { CherryInOauthService } from '@/services/CherryInOauthService';

const { makeRedirectUri, useAuthRequest, ResponseType } = AuthSession;

const CHERRYIN_OAUTH_SERVER = 'https://open.cherryin.ai';

export class UserCancelledError extends Error {
  constructor() {
    super('User cancelled');
    this.name = 'UserCancelledError';
  }
}

export interface UseCherryInOAuthOptions {
  providerId: string;
  requestConfirm: (options: { title: string; message: string; onConfirm: () => void }) => void;
  onOAuthComplete?: () => void;
}

export function useCherryInOAuth(options: UseCherryInOAuthOptions) {
  const { providerId, requestConfirm, onOAuthComplete } = options;
  const { t } = useTranslation();
  const { provider: providerService } = useDataServices();
  const { toast } = useToast();
  const oauth = CherryInOauthService.getInstance(providerService);

  // Provider & auth config queries

  const providerQuery = useDataQuery({
    enabled: Boolean(providerId),
    queryFn: (services) => services.provider.getByProviderId(providerId),
    queryKey: queryKeys.providers.detail(providerId),
    retry: false,
  });
  const provider = providerQuery.data;

  const authConfigQuery = useDataQuery({
    enabled: Boolean(providerId),
    queryFn: (services) => services.provider.getAuthConfig(providerId),
    queryKey: queryKeys.providers.authConfig(providerId),
    retry: false,
  });
  const hasOAuthToken =
    authConfigQuery.data?.type === 'oauth' && Boolean(authConfigQuery.data.accessToken);

  // Mutations

  const replaceApiKeysMutation = useDataMutation({
    invalidateQueries: [
      queryKeys.providers.detail(providerId),
      queryKeys.providers.list(),
      queryKeys.providers.apiKeys(providerId),
      queryKeys.providers.authConfig(providerId),
    ],
    mutationFn: (
      services,
      apiKeys: { id: string; key: string; isEnabled: boolean; label?: string }[],
    ) => services.provider.replaceApiKeys(providerId, apiKeys),
  });

  const saveOAuthResultMutation = useDataMutation({
    invalidateQueries: [
      queryKeys.providers.detail(providerId),
      queryKeys.providers.list(),
      queryKeys.providers.apiKeys(providerId),
      queryKeys.providers.authConfig(providerId),
    ],
    mutationFn: (services, apiKeysString: string) => {
      const oauthInstance = CherryInOauthService.getInstance(services.provider);
      return oauthInstance.saveOAuthResult(providerId, apiKeysString);
    },
  });

  // Sign-in (expo-auth-session)

  const redirectUri = makeRedirectUri({ scheme: 'cherrystudio', path: 'oauth/callback' });

  const [request, , promptAsync] = useAuthRequest(
    {
      clientId: CHERRYIN_CONFIG.CLIENT_ID,
      redirectUri,
      responseType: ResponseType.Code,
      scopes: CHERRYIN_CONFIG.SCOPES.split(' '),
      usePKCE: true,
    },
    {
      authorizationEndpoint: `${CHERRYIN_OAUTH_SERVER}/oauth2/auth`,
      tokenEndpoint: `${CHERRYIN_OAUTH_SERVER}/oauth2/token`,
    },
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
      const result = await oauth.getBalance(CHERRYIN_OAUTH_SERVER);
      setBalance(result.balance);
    } catch (error) {
      console.error('[CherryIN] fetchData failed:', error);
      setBalance(null);
    } finally {
      setIsLoadingData(false);
    }
  }, [oauth]);

  const handleLogout = useCallback(() => {
    requestConfirm({
      title: t('settings.provider.oauth.cherryIn.logout'),
      message: t('settings.provider.oauth.cherryIn.logout_confirm'),
      onConfirm: async () => {
        setIsLoggingOut(true);
        try {
          await oauth.logout(CHERRYIN_OAUTH_SERVER);
          setBalance(null);

          const remainingKeys = await oauth.getNonOAuthApiKeys(providerId);
          await replaceApiKeysMutation.mutateAsync(remainingKeys);
          await authConfigQuery.refetch();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.show({
            variant: 'warning',
            label: t('settings.provider.oauth.cherryIn.logout_warning'),
            description: message,
          });
        } finally {
          setIsLoggingOut(false);
        }
      },
    });
  }, [requestConfirm, t, oauth, providerId, replaceApiKeysMutation, authConfigQuery, toast]);

  const handleOAuthLogin = useCallback(async () => {
    if (!request) {
      throw new Error('OAuth request is not ready');
    }

    setIsLoggingIn(true);
    try {
      const result = await promptAsync();

      if (result.type !== 'success') {
        throw result.type === 'cancel' ? new UserCancelledError() : new Error('OAuth failed');
      }

      if (!request.codeVerifier) {
        throw new Error('PKCE code verifier is missing');
      }

      // Exchange code → tokens → API keys
      const apiKeys = await oauth.completeOAuth({
        oauthServer: CHERRYIN_OAUTH_SERVER,
        apiHost: CHERRYIN_OAUTH_SERVER,
        code: result.params.code,
        codeVerifier: request.codeVerifier,
        redirectUri,
      });

      // Save API keys + enable provider
      await saveOAuthResultMutation.mutateAsync(apiKeys);
      await fetchData();

      onOAuthComplete?.();
    } finally {
      setIsLoggingIn(false);
    }
  }, [
    request,
    promptAsync,
    oauth,
    redirectUri,
    saveOAuthResultMutation,
    fetchData,
    onOAuthComplete,
  ]);

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
