import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as AuthSession from 'expo-auth-session';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys, useBackendModule } from '@/frontend/data';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import type { OAuthFlowPresentation } from '@/shared/oauth';

const OAUTH_REDIRECT = { path: 'oauth/callback', scheme: 'cherrystudio' } as const;

export const providerOauthStatusKey = (providerId: string) =>
  ['provider-oauth-status', providerId] as const;

export class UserCancelledError extends Error {
  constructor() {
    super('User cancelled');
    this.name = 'UserCancelledError';
  }
}

export function useProviderOauth(providerId: string) {
  const oauth = useBackendModule('oauth');
  const queryClient = useQueryClient();
  const router = useRouter();
  const { i18n } = useTranslation();
  const activeFlowId = useRef<string | undefined>(undefined);
  const [deviceAuthorization, setDeviceAuthorization] = useState<
    Extract<OAuthFlowPresentation, { type: 'device-code-session' }> | undefined
  >();

  const statusQuery = useQuery({
    enabled: Boolean(providerId),
    queryFn: () => oauth.getStatus(providerId),
    queryKey: providerOauthStatusKey(providerId),
    retry: false,
  });

  const refresh = useCallback(
    () => invalidateProviderOauthQueries(queryClient, providerId),
    [providerId, queryClient],
  );

  const loginMutation = useMutation({
    mutationFn: async () => {
      const redirectUri = AuthSession.makeRedirectUri(OAUTH_REDIRECT);
      const flow = await oauth.startAuthorization({
        language: i18n.language,
        providerId,
        redirectUri,
      });
      activeFlowId.current = flow.flowId;

      if (flow.type === 'webview-api-key') {
        router.push({ params: { flowId: flow.flowId }, pathname: '/oauth/authorize' });
        activeFlowId.current = undefined;
        return;
      }

      if (flow.type === 'device-code-session') {
        setDeviceAuthorization(flow);
        await Clipboard.setStringAsync(flow.userCode).catch(() => undefined);
        await Promise.all([
          openExternalUrl(flow.verificationUri),
          oauth.completeAuthorization({ flowId: flow.flowId, type: flow.type }),
        ]);
        setDeviceAuthorization(undefined);
        activeFlowId.current = undefined;
        await refresh();
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(flow.authorizationUrl, flow.redirectUri);
      if (result.type !== 'success') {
        throw new UserCancelledError();
      }
      await oauth.completeAuthorization({
        callbackUrl: result.url,
        flowId: flow.flowId,
        type: flow.type,
      });
      activeFlowId.current = undefined;
      await refresh();
    },
    onError: () => {
      setDeviceAuthorization(undefined);
      const flowId = activeFlowId.current;
      activeFlowId.current = undefined;
      if (flowId) void oauth.cancelAuthorization(flowId);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => oauth.logout(providerId),
    onSuccess: refresh,
  });

  const cancelAuthorization = useCallback(async () => {
    const flowId = activeFlowId.current;
    activeFlowId.current = undefined;
    setDeviceAuthorization(undefined);
    if (flowId) await oauth.cancelAuthorization(flowId);
  }, [oauth]);

  useEffect(
    () => () => {
      const flowId = activeFlowId.current;
      if (flowId) void oauth.cancelAuthorization(flowId);
    },
    [oauth],
  );

  return {
    cancelAuthorization,
    deviceAuthorization,
    isLoggingIn: loginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    status: statusQuery.data,
    statusQuery,
  };
}

export async function invalidateProviderOauthQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  providerId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: providerOauthStatusKey(providerId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.detail(providerId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.list() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.apiKeys(providerId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.authConfig(providerId) }),
  ]);
}

export type ProviderOauthController = ReturnType<typeof useProviderOauth>;
