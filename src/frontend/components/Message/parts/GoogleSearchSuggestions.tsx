import { BackgroundPressExclusion, ContextMenuExclusion } from '@cherrystudio/ui/components';
import { WebView } from 'react-native-webview';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

const ORIGINS = ['*'];

/** Preserve Google's supplied search presentation in an isolated, script-free surface. */
export function GoogleSearchSuggestions({ html }: { html: string }) {
  const openLink = (url: string) => {
    if (/^https?:\/\//i.test(url)) void openExternalUrl(url);
  };
  return (
    <ContextMenuExclusion>
      <BackgroundPressExclusion>
        <WebView
          style={{ height: 160, backgroundColor: 'transparent' }}
          source={{
            html: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https://www.gstatic.com; base-uri 'none'; form-action 'none'"></head><body style="margin:0">${html}</body></html>`,
          }}
          originWhitelist={ORIGINS}
          javaScriptEnabled={false}
          javaScriptCanOpenWindowsAutomatically={false}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          incognito
          onOpenWindow={({ nativeEvent }) => openLink(nativeEvent.targetUrl)}
          onShouldStartLoadWithRequest={({ url }) => {
            if (url === 'about:blank') return true;
            openLink(url);
            return false;
          }}
        />
      </BackgroundPressExclusion>
    </ContextMenuExclusion>
  );
}
