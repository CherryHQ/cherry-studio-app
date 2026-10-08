import {
  FILE_PREVIEW_BASE_URL,
  FILE_PREVIEW_PAGE_GLOBAL,
  type HostMessage,
  PageMessageSchema,
} from '@cherrystudio/file-preview-webview/protocol';
import { ContentState } from '@cherrystudio/ui/components';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useUniwind, withUniwind } from 'uniwind';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import type { ResolvedFile } from '@/shared/contracts/file';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { DocumentPreviewPage } from '../hooks/useDocumentPreviewPage';
import {
  documentPreviewNavigationAction,
  isDocumentPreviewOrigin,
} from '../utils/documentPreviewNavigation';
import { FilePreviewBridge } from '../utils/filePreviewBridge';

const logger = loggerService.withContext('FileDocumentPreview');
const PreviewWebView = withUniwind(WebView);
// All navigation reaches our policy instead of the wrapper opening unknown schemes.
const ORIGIN_WHITELIST = ['*'];
// Touch-sized toolbar controls; the package default is 1.75rem.
const TOOLBAR_BUTTON_SIZE = '2.75rem';

/** Delivers one serialized {@link HostMessage} to the page. */
function deliver(webView: WebView | null, serializedMessage: string): void {
  webView?.injectJavaScript(
    `window.${FILE_PREVIEW_PAGE_GLOBAL}.receive(${serializedMessage});true;`,
  );
}

export function FileDocumentPreview({
  file,
  page,
  onFailure,
  onRequestOpen,
  onUnsupported,
}: {
  file: ResolvedFile;
  page: DocumentPreviewPage;
  onFailure: () => void;
  onRequestOpen: () => void;
  onUnsupported: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { theme } = useUniwind();
  const { bottom } = useSafeAreaInsets();
  const [background, foreground, primary, secondary, mutedForeground, border, borderSubtle, ring] =
    useThemeColor([
      'background',
      'foreground',
      'primary',
      'secondary',
      'muted-foreground',
      'border',
      'border-subtle',
      'ring',
    ]);
  const webViewRef = useRef<WebView>(null);
  const bridgeRef = useRef<FilePreviewBridge | null>(null);
  const isReadyRef = useRef(false);
  const { id: entryId, filename, mediaType, updatedAt } = file.entry;
  const renderMessage: HostMessage = {
    type: 'render',
    source: { id: entryId, name: filename, mediaType },
    locale: i18n.language,
    isDark: theme === 'dark',
    style: {
      '--background': background,
      '--foreground': foreground,
      '--primary': primary,
      // HeroUI reserves `muted`; `secondary` is Cherry's neutral secondary surface.
      '--muted': secondary,
      '--muted-foreground': mutedForeground,
      '--border': border,
      '--border-subtle': borderSubtle,
      '--ring': ring,
      '--file-preview-toolbar-button-size': TOOLBAR_BUTTON_SIZE,
      '--file-preview-bottom-inset': `${bottom}px`,
    },
  };
  const serializedRender = JSON.stringify(renderMessage);
  const serializedRenderRef = useRef(serializedRender);

  useEffect(() => {
    const bridge = new FilePreviewBridge({
      fileUri: file.uri,
      revision: String(updatedAt),
      pdfResources: page.pdfResources,
      send: (message) => deliver(webViewRef.current, JSON.stringify(message)),
    });
    bridgeRef.current = bridge;
    return () => {
      bridge.dispose();
      if (bridgeRef.current === bridge) bridgeRef.current = null;
    };
  }, [file.uri, updatedAt, page.pdfResources]);

  // Theme, locale and inset changes re-render the open document without reopening it.
  useEffect(() => {
    serializedRenderRef.current = serializedRender;
    if (isReadyRef.current) deliver(webViewRef.current, serializedRender);
  }, [serializedRender]);

  const handleMessage = ({ nativeEvent }: WebViewMessageEvent) => {
    if (!isDocumentPreviewOrigin(nativeEvent.url)) return;
    let data: unknown;
    try {
      data = JSON.parse(nativeEvent.data);
    } catch {
      return;
    }
    const parsed = PageMessageSchema.safeParse(data);
    if (!parsed.success) {
      logger.warn('Ignored malformed preview message', { entryId });
      return;
    }
    const message = parsed.data;
    switch (message.type) {
      case 'ready':
        isReadyRef.current = true;
        deliver(webViewRef.current, serializedRenderRef.current);
        return;
      case 'diagnostic':
        // Oversized or malformed documents are expected outcomes, not app failures.
        logger.warn(message.message, {
          entryId,
          level: message.level,
          code: message.code,
          context: message.context,
          detail: message.detail,
        });
        return;
      case 'error':
        logger.warn('Document preview failed', {
          entryId,
          code: message.code,
          message: message.message,
        });
        return;
      case 'requestOpen':
        if (message.reason === 'unsupported') onUnsupported();
        else onRequestOpen();
        return;
      default:
        bridgeRef.current?.handle(message);
    }
  };

  const handleFailure = () => {
    isReadyRef.current = false;
    onFailure();
  };

  return (
    <PreviewWebView
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      // The preview reserves the bottom safe area itself through `--file-preview-bottom-inset`.
      automaticallyAdjustContentInsets={false}
      bounces={false}
      className="flex-1 bg-background"
      containerClassName="flex-1 bg-background"
      contentInsetAdjustmentBehavior="never"
      contentMode="mobile"
      incognito
      javaScriptCanOpenWindowsAutomatically={false}
      mixedContentMode="never"
      onContentProcessDidTerminate={handleFailure}
      onError={handleFailure}
      onMessage={handleMessage}
      onOpenWindow={({ nativeEvent }) => {
        if (documentPreviewNavigationAction(nativeEvent.targetUrl) === 'external') {
          void openExternalUrl(nativeEvent.targetUrl);
        }
      }}
      onRenderProcessGone={handleFailure}
      onShouldStartLoadWithRequest={({ url, isTopFrame }) => {
        const action = documentPreviewNavigationAction(url, isTopFrame);
        if (action === 'external') void openExternalUrl(url);
        return action === 'allow';
      }}
      originWhitelist={ORIGIN_WHITELIST}
      overScrollMode="never"
      ref={webViewRef}
      renderLoading={() => (
        <View className="absolute inset-0 items-center justify-center bg-background p-6">
          <ContentState.Loading title={t('fileViewer.loading')} />
        </View>
      )}
      // The page frame never scrolls; the preview's own panes scroll and zoom.
      scrollEnabled={false}
      setBuiltInZoomControls={false}
      sharedCookiesEnabled={false}
      source={{ html: page.html, baseUrl: FILE_PREVIEW_BASE_URL }}
      startInLoadingState
      thirdPartyCookiesEnabled={false}
      webviewDebuggingEnabled={__DEV__}
    />
  );
}
