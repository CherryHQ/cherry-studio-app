import { useEffect, useRef, useState } from 'react';
import { PixelRatio, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { withUniwind } from 'uniwind';

import { capturePng } from '@/frontend/utils/capturePng';
import { DocumentExportError, type CaptureHtmlPages } from '@/shared/contracts/documentExport';

import {
  HTML_CAPTURE_HEIGHT,
  HTML_CAPTURE_WIDTH,
  parseHtmlCapturePages,
  type HtmlCapturePage,
} from '../utils/htmlCapturePlan';
import { htmlCapturePageScript, htmlCaptureSetupScript } from '../utils/htmlCaptureScript';

const CaptureWebView = withUniwind(WebView);

export type HtmlCaptureRequest = {
  id: string;
  html: string;
  input: Parameters<CaptureHtmlPages>[0];
  started: boolean;
  abort(error: unknown): void;
  finish(error?: unknown): void;
};

export function HtmlConversionSurface({ request }: { request: HtmlCaptureRequest }) {
  const wrapper = useRef<View>(null);
  const webView = useRef<WebView>(null);
  const waiting = useRef<
    { index: number; resolve(): void; reject(error: Error): void } | undefined
  >(undefined);
  const processing = useRef(false);
  const layout = useRef({ width: 0, height: 0 });
  const [page, setPage] = useState<{ index: number; bounds: HtmlCapturePage }>();
  const injectedIndex = useRef(-1);
  const density = PixelRatio.get();
  const width = (page?.bounds.width ?? HTML_CAPTURE_WIDTH) / density;
  const height = (page?.bounds.height ?? HTML_CAPTURE_HEIGHT) / density;
  const fail = () => {
    request.abort(new DocumentExportError('capture-failed'));
  };

  useEffect(() => {
    const abort = () => {
      waiting.current?.reject(new DOMException('Conversion cancelled', 'AbortError'));
    };
    request.input.signal.addEventListener('abort', abort, { once: true });
    return () => {
      request.input.signal.removeEventListener('abort', abort);
      abort();
    };
  }, [request]);

  const prepare = () => {
    if (!page || injectedIndex.current === page.index || request.input.signal.aborted) return;
    if (
      Math.abs(layout.current.width - width) > 0.5 ||
      Math.abs(layout.current.height - height) > 0.5
    )
      return;
    injectedIndex.current = page.index;
    webView.current?.injectJavaScript(
      htmlCapturePageScript(request.id, page.index, page.bounds, density),
    );
  };
  useEffect(prepare);

  async function capturePages(pages: HtmlCapturePage[]) {
    try {
      for (const [index, bounds] of pages.entries()) {
        request.input.signal.throwIfAborted();
        await new Promise<void>((resolve, reject) => {
          waiting.current = { index, resolve, reject };
          setPage({ index, bounds });
        });
        waiting.current = undefined;
        const capture = await capturePng(wrapper, bounds, request.input.signal);
        try {
          await request.input.onPage(capture, index, pages.length);
        } finally {
          capture.release();
        }
      }
      request.finish();
    } catch (error) {
      request.finish(error);
    }
  }

  return (
    <View
      ref={wrapper}
      accessibilityElementsHidden
      collapsable={false}
      className="bg-constant-white"
      importantForAccessibility="no-hide-descendants"
      onLayout={({ nativeEvent }) => {
        layout.current = nativeEvent.layout;
        prepare();
      }}
      pointerEvents="none"
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
        contentMode="desktop"
        incognito
        injectedJavaScript={htmlCaptureSetupScript(request.id, request.input.format, density)}
        javaScriptCanOpenWindowsAutomatically={false}
        onContentProcessDidTerminate={fail}
        onError={fail}
        onMessage={({ nativeEvent }) => {
          if (request.input.signal.aborted || nativeEvent.data.length > 16_384) return;
          try {
            const message = JSON.parse(nativeEvent.data);
            if (message.id !== request.id) return;
            if (message.phase === 'limit') {
              request.abort(new DocumentExportError('image-size-limit'));
              return;
            }
            if (message.phase === 'error') {
              fail();
              return;
            }
            if (
              message.phase === 'ready' &&
              message.index === waiting.current?.index &&
              message.index === injectedIndex.current
            ) {
              waiting.current?.resolve();
            } else if (message.phase === 'measured' && !processing.current) {
              const pages = parseHtmlCapturePages(message.pages);
              if (request.input.format === 'image' && pages.length !== 1)
                throw new DocumentExportError('capture-failed');
              processing.current = true;
              request.started = true;
              void capturePages(pages);
            }
          } catch (error) {
            request.abort(
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
        source={{ html: request.html }}
        style={{ width, height }}
        textZoom={100}
        thirdPartyCookiesEnabled={false}
      />
    </View>
  );
}
