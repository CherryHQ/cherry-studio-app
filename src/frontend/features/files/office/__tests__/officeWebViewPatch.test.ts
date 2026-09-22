import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const webViewDirectory = dirname(require.resolve('react-native-webview/package.json'));
const source = readFileSync(
  join(webViewDirectory, 'android/src/main/java/com/reactnativecommunity/webview/RNCWebView.java'),
  'utf8',
);

// These are installed native-source guards, not Android runtime acceptance.
// Dropping the patch restores the startup race before Expo can read its DOM props.
describe('Office DOM WebView Android bridge patch', () => {
  test('registers the synchronous bridge independently of WebMessageListener support', () => {
    const registration = source.slice(
      source.indexOf('protected void createRNCWebViewBridge'),
      source.indexOf('private String buildPostMessageOverrideScript'),
    );
    const bridge = registration.indexOf('addJavascriptInterface(bridge, JAVASCRIPT_INTERFACE)');
    const optionalMessaging = registration.indexOf(
      'WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)',
    );

    expect(bridge).toBeGreaterThanOrEqual(0);
    expect(optionalMessaging).toBeGreaterThan(bridge);
    expect(registration).toContain('webView, MESSAGE_LISTENER_INTERFACE');
  });

  test('returns initial JSON directly through a native method without script interpolation', () => {
    expect(source).toMatch(
      /@JavascriptInterface\s+public String injectedObjectJson\(\)\s*\{\s*return mWebView\.injectedJavaScriptObject;/,
    );
    expect(source).not.toContain('injectJavascriptObject()');
  });

  test('preserves the synchronous JSON reader when upgrading the message transport', () => {
    expect(source).toContain('postMessage: function(msg) { wml.postMessage(msg); }');
    expect(source).toContain('injectedObjectJson: function() { return nb.injectedObjectJson(); }');
    expect(source).toContain(
      'RNCWebView.this.onMessage(message.getData(), sourceOrigin.toString())',
    );
  });
});
