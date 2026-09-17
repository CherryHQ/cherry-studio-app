import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { capturePng } from '@/frontend/utils/capturePng';
import { DocumentExportError, type CaptureExportHtml } from '@/shared/contracts/documentExport';

import { imageCapturePlan, type ImageCapturePlan } from '../utils/imageCapturePlan';
import { imageMeasurementScript, imagePageReadinessScript } from '../utils/imageCaptureScripts';
import { IMAGE_PAGE_CHROME, imagePagePlan, type ImagePageSlice } from '../utils/imagePagePlan';

type CaptureInput = Parameters<CaptureExportHtml>[0];
type CaptureRequest = {
  input: CaptureInput;
  id: number;
  controller: AbortController;
  nativeStarted: boolean;
  finished?: Promise<void>;
  settled: boolean;
  touch(): void;
  finish(error?: Error): void;
};
type PageFrame = { pages: ImagePageSlice[]; index: number; plan: ImageCapturePlan };
let nextId = 0;
// Hold the physical lease through native work and the receiving session's file copy.
let captureLease: CaptureRequest | undefined;

export function useDocumentExportHtmlCapture() {
  const [request, setRequest] = useState<CaptureRequest>();
  const current = useRef<CaptureRequest | undefined>(undefined);
  const mounted = useRef(true);
  const capture = useCallback<CaptureExportHtml>(async (input) => {
    input.signal.throwIfAborted();
    if (captureLease?.settled) await captureLease.finished;
    input.signal.throwIfAborted();
    if (!mounted.current) throw new DocumentExportError('disposed');
    if (captureLease) throw new DocumentExportError('busy');
    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const request: CaptureRequest = {
        input,
        id: ++nextId,
        controller: new AbortController(),
        nativeStarted: false,
        settled: false,
        touch: () => {
          clearTimeout(timer);
          timer = setTimeout(
            () => request.finish(new DocumentExportError('capture-failed')),
            60_000,
          );
        },
        finish: (error) => {
          if (request.settled) return;
          request.settled = true;
          request.controller.abort();
          clearTimeout(timer);
          input.signal.removeEventListener('abort', abort);
          if (!request.nativeStarted && captureLease === request) captureLease = undefined;
          if (current.current === request) current.current = undefined;
          if (mounted.current) setRequest((current) => (current === request ? undefined : current));
          const settle = () => {
            if (error) reject(error);
            else resolve();
          };
          // A page copy may still be writing inside onPage. The session must not
          // remove its output directory until that physical work has settled.
          if (request.nativeStarted)
            void Promise.resolve()
              .then(() => request.finished)
              .then(settle, settle);
          else settle();
        },
      };
      const abort = () => request.finish(new DOMException('Export cancelled', 'AbortError'));
      request.touch();
      input.signal.addEventListener('abort', abort, { once: true });
      captureLease = request;
      current.current = request;
      setRequest(request);
    });
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current?.finish(new DOMException('Export closed', 'AbortError'));
    };
  }, []);
  return {
    capture,
    surface: request ? <CaptureSurface key={request.id} request={request} /> : null,
  };
}

function CaptureSurface({ request }: { request: CaptureRequest }) {
  const wrapper = useRef<View>(null);
  const webView = useRef<WebView>(null);
  const nativeLayout = useRef({ width: 0, height: 0 });
  const injected = useRef(false);
  const [frame, setFrame] = useState<PageFrame>();
  const { input } = request;
  const source = useMemo(() => ({ html: input.html }), [input.html]);
  const density = PixelRatio.get();
  const width = frame ? frame.plan.width / density : input.width;
  // The WebView lays out the entire document inside a bounded viewport before capture.
  const height = frame ? frame.plan.height / density : 1;
  const fail = () => request.finish(new DocumentExportError('capture-failed'));
  const makeFrame = (pages: ImagePageSlice[], index: number): PageFrame => ({
    pages,
    index,
    plan: imageCapturePlan(
      input.width,
      pages[index].height + (input.layout === 'pages' ? IMAGE_PAGE_CHROME : 0),
    ),
  });

  const prepareLayout = useCallback(() => {
    if (!frame || injected.current || request.settled) return;
    if (
      Math.abs(nativeLayout.current.width * density - frame.plan.width) > 1 ||
      Math.abs(nativeLayout.current.height * density - frame.plan.height) > 1
    )
      return;
    injected.current = true;
    webView.current?.injectJavaScript(
      imagePageReadinessScript(
        request.id,
        frame.index,
        frame.pages.length,
        input.width,
        frame.pages[frame.index],
        frame.plan,
        density,
        input.layout,
      ),
    );
  }, [density, frame, input.layout, input.width, request]);
  useEffect(() => {
    prepareLayout();
  }, [prepareLayout]);

  const capturePage = async (frame: PageFrame) => {
    if (request.nativeStarted || request.settled) return;
    request.nativeStarted = true;
    try {
      const image = await capturePng(wrapper, frame.plan, request.controller.signal);
      try {
        request.controller.signal.throwIfAborted();
        await input.onPage({
          uri: image.uri,
          width: image.width,
          height: image.height,
          index: frame.index,
          total: frame.pages.length,
        });
        request.controller.signal.throwIfAborted();
      } finally {
        image.release();
      }
      if (frame.index + 1 === frame.pages.length) request.finish();
      else {
        injected.current = false;
        request.touch();
        setFrame(makeFrame(frame.pages, frame.index + 1));
      }
    } catch (error) {
      request.finish(error instanceof Error ? error : new DocumentExportError('capture-failed'));
    } finally {
      request.nativeStarted = false;
      if (request.settled && captureLease === request) captureLease = undefined;
    }
  };

  return (
    <View
      ref={wrapper}
      collapsable={false}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={({ nativeEvent }) => {
        nativeLayout.current = nativeEvent.layout;
        prepareLayout();
      }}
      style={{ width, height, overflow: 'hidden' }}
    >
      <WebView
        ref={webView}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        bounces={false}
        incognito
        injectedJavaScript={imageMeasurementScript(request.id, input.layout)}
        javaScriptCanOpenWindowsAutomatically={false}
        onContentProcessDidTerminate={fail}
        onError={fail}
        onMessage={({ nativeEvent }) => {
          if (request.settled || request.nativeStarted || nativeEvent.data.length > 2_000_000)
            return;
          try {
            const message = JSON.parse(nativeEvent.data);
            if (message.id !== request.id) return;
            if (message.error) {
              fail();
              return;
            }
            if (message.phase === 'ready') {
              if (frame && injected.current && message.index === frame.index)
                request.finished = capturePage(frame);
              else fail();
              return;
            }
            if (message.phase !== 'measure' || frame) return;
            if (!Number.isFinite(message.width) || message.width > input.width + 1) {
              fail();
              return;
            }
            const pages = imagePagePlan(message, input.layout);
            request.touch();
            setFrame(makeFrame(pages, 0));
          } catch (error) {
            request.finish(
              error instanceof DocumentExportError
                ? error
                : new DocumentExportError('capture-failed'),
            );
          }
        }}
        onRenderProcessGone={fail}
        onShouldStartLoadWithRequest={({ url }) => url === 'about:blank'}
        originWhitelist={['*']}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled={false}
        source={source}
        style={{ width, height }}
        textZoom={100}
        thirdPartyCookiesEnabled={false}
      />
    </View>
  );
}
