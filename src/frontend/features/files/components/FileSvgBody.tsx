import { ContentState } from '@cherrystudio/ui/components';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { withUniwind } from 'uniwind';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { svgPreviewHtml } from '../utils/svgPreviewHtml';

const SvgWebView = withUniwind(WebView);
const ORIGIN_WHITELIST = ['*'];
const READINESS_SCRIPT = `
  Promise.all(Array.from(document.images).map(function(image) { return image.decode(); }))
    .then(function() { window.ReactNativeWebView.postMessage('ready'); })
    .catch(function() { window.ReactNativeWebView.postMessage('error'); });
  true;
`;

/** A local SVG image surface. The bridge accepts readiness only. */
export function FileSvgBody({ data, onFailure }: { data: string; onFailure: () => void }) {
  const { t } = useTranslation();
  const paper = useThemeColor('constant-white');
  const [ready, setReady] = useState(false);
  const source = { html: svgPreviewHtml(data, paper) };

  useEffect(() => {
    if (ready) return;
    const timeout = setTimeout(onFailure, 30_000);
    return () => clearTimeout(timeout);
  }, [onFailure, ready]);

  return (
    <View className="flex-1">
      <SvgWebView
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        className="flex-1 bg-constant-white"
        containerClassName="flex-1 bg-background"
        contentMode="mobile"
        incognito
        injectedJavaScript={READINESS_SCRIPT}
        javaScriptCanOpenWindowsAutomatically={false}
        onContentProcessDidTerminate={onFailure}
        onError={onFailure}
        onMessage={({ nativeEvent }) => {
          if (nativeEvent.data === 'ready') setReady(true);
          else if (nativeEvent.data === 'error') onFailure();
        }}
        onOpenWindow={() => {}}
        onRenderProcessGone={onFailure}
        onShouldStartLoadWithRequest={({ url, isTopFrame }) =>
          url === 'about:blank' && isTopFrame !== false
        }
        originWhitelist={ORIGIN_WHITELIST}
        sharedCookiesEnabled={false}
        source={source}
        textZoom={100}
        thirdPartyCookiesEnabled={false}
      />
      {!ready ? (
        <View className="absolute inset-0 items-center justify-center bg-background p-6">
          <ContentState.Loading title={t('fileViewer.loading')} />
        </View>
      ) : null}
    </View>
  );
}
