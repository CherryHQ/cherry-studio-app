import { Spinner } from '@cherrystudio/ui/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

import { useAlert } from '@/frontend/components/AlertProvider';
import { CloseHeader } from '@/frontend/components/headers';
import { useBackendModule } from '@/frontend/data';
import { invalidateProviderOauthQueries } from '@/frontend/features/settings/ProviderScreen/hooks/useProviderOauth';
import { isProviderOauthNavigationAllowed } from '@/frontend/features/settings/ProviderScreen/utils/providerOauthNavigation';

const WEBVIEW_BRIDGE = `
  (function () {
    var send = function (payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ payload: payload }));
      }
    };
    var opener = { closed: false, close: function () {}, postMessage: send };
    try {
      Object.defineProperty(window, 'opener', { configurable: true, value: opener });
    } catch (_) {
      try { window.opener = opener; } catch (_) {}
    }
    window.addEventListener('message', function (event) {
      if (event.origin === window.location.origin) send(event.data);
    });
  })();
  true;
`;

// Keep HTTPS navigations in-process so the exact-origin guard can reject them
// instead of react-native-webview handing unmatched URLs to the system browser.
const WEBVIEW_ROUTABLE_ORIGINS = ['about:blank', 'https://*'];

export default function ProviderOauthAuthorizeScreen() {
  const { flowId } = useLocalSearchParams<{ flowId?: string }>();
  const oauth = useBackendModule('oauth');
  const queryClient = useQueryClient();
  const router = useRouter();
  const { alert } = useAlert();
  const { t } = useTranslation();
  const completed = useRef(false);
  const completing = useRef(false);
  const navigationWarningShown = useRef(false);
  const authorizationQuery = useQuery({
    enabled: Boolean(flowId),
    queryFn: () => oauth.getAuthorization(flowId ?? ''),
    queryKey: ['provider-oauth-authorization', flowId],
    retry: false,
  });
  const authorization = authorizationQuery.data;

  const closeWithError = useCallback(
    (error: unknown) => {
      alert.show({
        description: error instanceof Error ? error.message : undefined,
        title: t('settings.provider.oauth.error'),
      });
      router.back();
    },
    [alert, router, t],
  );

  useEffect(() => {
    if (!flowId) router.back();
  }, [flowId, router]);

  useEffect(() => {
    if (authorizationQuery.isError) closeWithError(authorizationQuery.error);
  }, [authorizationQuery.error, authorizationQuery.isError, closeWithError]);

  useEffect(
    () => () => {
      if (flowId && !completed.current) void oauth.cancelAuthorization(flowId);
    },
    [flowId, oauth],
  );

  const handleMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      if (
        !flowId ||
        !authorization ||
        authorization.type !== 'webview-api-key' ||
        completing.current
      ) {
        return;
      }
      completing.current = true;
      try {
        const result = await oauth.completeAuthorization({
          data: event.nativeEvent.data,
          flowId,
          sourceUrl: event.nativeEvent.url,
          type: 'webview-api-key',
        });
        if (result.status === 'ignored') return;

        completed.current = true;
        await invalidateProviderOauthQueries(queryClient, authorization.providerId);
        router.back();
      } catch (error) {
        closeWithError(error);
      } finally {
        completing.current = false;
      }
    },
    [authorization, closeWithError, flowId, oauth, queryClient, router],
  );

  const allowNavigation = useCallback(
    (request: WebViewNavigation) => {
      if (!authorization || authorization.type !== 'webview-api-key') return false;
      const isAllowed = isProviderOauthNavigationAllowed(request.url, authorization.allowedOrigins);
      if (!isAllowed && !navigationWarningShown.current) {
        navigationWarningShown.current = true;
        alert.show({ title: t('settings.provider.oauth.navigationBlocked') });
      }
      return isAllowed;
    },
    [alert, authorization, t],
  );

  if (!authorization || authorization.type !== 'webview-api-key') {
    return (
      <>
        <CloseHeader title={t('settings.provider.oauth.authorizationTitle')} />
        <View className="flex-1 items-center justify-center bg-background">
          <Spinner accessibilityLabel={t('settings.provider.loading')} />
        </View>
      </>
    );
  }

  return (
    <>
      <CloseHeader title={t('settings.provider.oauth.authorizationTitle')} />
      <WebView
        allowsLinkPreview={false}
        injectedJavaScriptBeforeContentLoaded={WEBVIEW_BRIDGE}
        javaScriptCanOpenWindowsAutomatically={false}
        onMessage={(event) => void handleMessage(event)}
        onShouldStartLoadWithRequest={allowNavigation}
        originWhitelist={WEBVIEW_ROUTABLE_ORIGINS}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        source={{ uri: authorization.authorizationUrl }}
        style={{ flex: 1 }}
        thirdPartyCookiesEnabled
        webviewDebuggingEnabled={false}
      />
    </>
  );
}
