import { ContentState } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { withUniwind } from 'uniwind';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

import { htmlNavigationAction } from '../utils/htmlNavigation';

const HtmlWebView = withUniwind(WebView);
// All navigation reaches our policy instead of the wrapper opening unknown schemes.
const ORIGIN_WHITELIST = ['*'];
const MOBILE_VIEWPORT_SCRIPT = `
  if (!document.querySelector('meta[name="viewport"]')) {
    var viewport = document.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1';
    document.head.appendChild(viewport);
  }
  true;
`;

export function FileHtmlBody({ html, onFailure }: { html: string; onFailure: () => void }) {
  const { t } = useTranslation();

  return (
    <HtmlWebView
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      className="flex-1 bg-constant-white"
      containerClassName="flex-1 bg-background"
      contentMode="mobile"
      incognito
      injectedJavaScript={MOBILE_VIEWPORT_SCRIPT}
      javaScriptCanOpenWindowsAutomatically={false}
      onContentProcessDidTerminate={onFailure}
      onError={onFailure}
      onOpenWindow={({ nativeEvent }) => {
        if (htmlNavigationAction(nativeEvent.targetUrl) === 'external') {
          void openExternalUrl(nativeEvent.targetUrl);
        }
      }}
      onRenderProcessGone={onFailure}
      onShouldStartLoadWithRequest={({ url, isTopFrame }) => {
        const action = htmlNavigationAction(url, isTopFrame);
        if (action === 'external') void openExternalUrl(url);
        return action === 'allow';
      }}
      originWhitelist={ORIGIN_WHITELIST}
      renderLoading={() => (
        <View className="absolute inset-0 items-center justify-center bg-background p-6">
          <ContentState.Loading title={t('fileViewer.loading')} />
        </View>
      )}
      sharedCookiesEnabled={false}
      source={{ html }}
      startInLoadingState
      thirdPartyCookiesEnabled={false}
    />
  );
}
