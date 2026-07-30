import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as AuthSession from 'expo-auth-session';
import { useToast } from 'heroui-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryKeys, useBackendModule } from '@/frontend/data';
import { CHERRYIN_CONFIG } from '@/shared/utils/cherryInOauth';

const { makeRedirectUri, useAuthRequest, ResponseType } = AuthSession;

const CHERRYIN_OAUTH_SERVER = 'https://open.cherryin.ai';

export class UserCancelledError extends Error {
  constructor() {
    super('User cancelled');
    this.name = 'UserCancelledError';
  }
}

export interface UseCherryInOauthOptions {
  providerId: string;
  requestConfirm: (options: { title: string; message: string; onConfirm: () => void }) => void;
  onOAuthComplete?: () => void;
}

export function useCherryInOauth(options: UseCherryInOauthOptions) {
  const { providerId, requestConfirm, onOAuthComplete } = options;
  const { t } = useTranslation();
  const { toast } = useToast();
  const providers = useBackendModule('providers');
  const queryClient = useQueryClient();

  // Provider & auth config queries

  const providerQuery = useQuery({
    enabled: Boolean(providerId),
    queryFn: () => providers.get(providerId),
    queryKey: queryKeys.providers.detail(providerId),
    retry: false,
  });
  const provider = providerQuery.data;

  const authConfigQuery = useQuery({
    enabled: Boolean(providerId),
    queryFn: () => providers.getAuth(providerId),
    queryKey: queryKeys.providers.authConfig(providerId),
    retry: false,
  });
  const hasOAuthToken =
    authConfigQuery.data?.type === 'oauth' && Boolean(authConfigQuery.data.accessToken);

  // Mutations

  const logoutMutation = useMutation({
    mutationFn: () => providers.logoutCherryIn(CHERRYIN_OAUTH_SERVER),
    onSuccess: () => invalidateOAuthQueries(queryClient, providerId),
  });

  const completeOAuthMutation = useMutation({
    mutationFn: providers.completeCherryInOAuth.bind(providers),
    onSuccess: () => invalidateOAuthQueries(queryClient, providerId),
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
      const result = await providers.getCherryInAccount(CHERRYIN_OAUTH_SERVER);
      setBalance(result?.balance ?? null);
    } catch (error) {
      console.error('[CherryIN] fetchData failed:', error);
      setBalance(null);
    }

    setIsLoadingData(false);
  }, [providers]);

  const handleLogout = useCallback(() => {
    requestConfirm({
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
          toast.show({
            variant: 'warning',
            label: t('settings.provider.oauth.cherryIn.logout_warning'),
            description: message,
          });
        }

        setIsLoggingOut(false);
      },
    });
  }, [authConfigQuery, logoutMutation, requestConfirm, t, toast]);

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
        oauthServer: CHERRYIN_OAUTH_SERVER,
        apiHost: CHERRYIN_OAUTH_SERVER,
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
