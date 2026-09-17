import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { withUniwind } from 'uniwind';

import { capturePng } from '@/frontend/utils/capturePng';
import { DocumentExportError } from '@/shared/contracts/documentExport';

import type { HtmlCaptureSession } from './createHtmlCaptureSession';
import type { HtmlCaptureFrame, HtmlCaptureSource } from './types';

const CaptureWebView = withUniwind(WebView);

export type HtmlCaptureRequest = {
  id: number;
  density: number;
  source: HtmlCaptureSource;
  session: HtmlCaptureSession;
};

export function HtmlCaptureSurface({ request }: { request: HtmlCaptureRequest }) {
  const { id, density, source, session } = request;
  const wrapper = useRef<View>(null);
  const webView = useRef<WebView>(null);
  const nativeLayout = useRef({ width: 0, height: 0 });
  const waiting = useRef<
    { index: number; resolve(): void; reject(error: unknown): void } | undefined
  >(undefined);
  const processing = useRef(false);
  const attached = useRef(false);
  const injectedIndex = useRef(-1);
  const [page, setPage] = useState<{ index: number; frame: HtmlCaptureFrame }>();
  const htmlSource = useMemo(() => ({ html: source.html }), [source.html]);
  const width = page ? page.frame.width / density : source.viewport.width;
  const height = page ? page.frame.height / density : source.viewport.height;
  const fail = () => session.abort(new DocumentExportError('capture-failed'));

  useEffect(() => {
    attached.current = true;
    const abort = () => {
      waiting.current?.reject(new DOMException('Capture cancelled', 'AbortError'));
      waiting.current = undefined;
    };
    session.signal.addEventListener('abort', abort, { once: true });
    if (session.signal.aborted) abort();
    return () => {
      attached.current = false;
      session.signal.removeEventListener('abort', abort);
      // Effect replay keeps the same request mounted. The hook still cancels
      // immediately when its owner closes, including any in-flight native work.
      queueMicrotask(() => {
        if (attached.current) return;
        session.abort(new DOMException('Capture surface closed', 'AbortError'));
        abort();
      });
    };
  }, [session]);

  const prepareLayout = useCallback(() => {
    if (!page || injectedIndex.current === page.index || session.signal.aborted) return;
    if (
      Math.abs(nativeLayout.current.width * density - page.frame.width) > 1 ||
      Math.abs(nativeLayout.current.height * density - page.frame.height) > 1
    )
      return;
    if (!webView.current) return;
    injectedIndex.current = page.index;
    webView.current.injectJavaScript(page.frame.script);
  }, [density, page, session]);
  useEffect(prepareLayout, [prepareLayout]);

  return (
    <View
      ref={wrapper}
      collapsable={false}
      className="bg-constant-white"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={({ nativeEvent }) => {
        nativeLayout.current = nativeEvent.layout;
        prepareLayout();
      }}
      style={{ width, height, overflow: 'hidden' }}
    >
      <CaptureWebView
        ref={webView}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        automaticallyAdjustContentInsets={false}
        bounces={false}
        className="bg-constant-white"
        contentMode={source.contentMode}
        incognito
        injectedJavaScript={source.setupScript}
        javaScriptCanOpenWindowsAutomatically={false}
        onContentProcessDidTerminate={fail}
        onError={fail}
        onMessage={({ nativeEvent }) => {
          if (session.signal.aborted || nativeEvent.data.length > source.maxMessageLength) return;
          try {
            const message = JSON.parse(nativeEvent.data);
            if (!message || typeof message !== 'object' || message.id !== id) return;
            if (message.phase === 'limit') throw new DocumentExportError('image-size-limit');
            if (message.error || message.phase === 'error')
              throw new DocumentExportError('capture-failed');
            if (message.phase === 'ready') {
              if (
                message.index === waiting.current?.index &&
                message.index === injectedIndex.current
              ) {
                waiting.current?.resolve();
                waiting.current = undefined;
              }
              return;
            }
            if (processing.current) return;
            const frames = source.readFrames(message);
            if (!frames) return;
            processing.current = true;
            session.run(frames, {
              prepare: (frame, index, signal) =>
                new Promise<void>((resolve, reject) => {
                  signal.throwIfAborted();
                  waiting.current = { index, resolve, reject };
                  setPage({ index, frame });
                }),
              capture: (frame, signal) => capturePng(wrapper, frame, signal),
            });
          } catch (error) {
            session.abort(
              error instanceof DocumentExportError
                ? error
                : new DocumentExportError('capture-failed'),
            );
          }
        }}
        onRenderProcessGone={fail}
        onShouldStartLoadWithRequest={({ url, isTopFrame }) =>
          isTopFrame !== false && (url === 'about:blank' || url.startsWith('about:blank#'))
        }
        originWhitelist={['*']}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled={false}
        source={htmlSource}
        style={{ width, height }}
        textZoom={100}
        thirdPartyCookiesEnabled={false}
      />
    </View>
  );
}
