import { useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { DocumentExportError, type CaptureExportHtml } from '@/shared/contracts/documentExport';

type CaptureInput = Parameters<CaptureExportHtml>[0];
type CaptureResult = Awaited<ReturnType<CaptureExportHtml>>;
type CaptureRequest = {
  input: CaptureInput;
  id: number;
  height?: number;
  nativeStarted: boolean;
  settled: boolean;
  finish(error?: Error, result?: CaptureResult): void;
};
let nextId = 0;
// Protect physical surface work across closing/reopened pages as well as logical operations.
let captureLease: CaptureRequest | undefined;

export function useDocumentExportHtmlCapture() {
  const [request, setRequest] = useState<CaptureRequest>();
  const current = useRef<CaptureRequest | undefined>(undefined);
  const mounted = useRef(true);
  const capture = useCallback<CaptureExportHtml>((input) => {
    input.signal.throwIfAborted();
    if (!mounted.current) return Promise.reject(new DocumentExportError('disposed'));
    if (captureLease) return Promise.reject(new DocumentExportError('busy'));
    return new Promise<CaptureResult>((resolve, reject) => {
      const request: CaptureRequest = {
        input,
        id: ++nextId,
        nativeStarted: false,
        settled: false,
        finish: (error, result) => {
          if (request.settled) {
            result?.release();
            return;
          }
          request.settled = true;
          clearTimeout(timer);
          input.signal.removeEventListener('abort', abort);
          if (!request.nativeStarted && captureLease === request) captureLease = undefined;
          if (current.current === request) current.current = undefined;
          if (mounted.current) setRequest(undefined);
          if (error) reject(error);
          else if (result) resolve(result);
          else reject(new DocumentExportError('capture-failed'));
        },
      };
      const abort = () => request.finish(new DOMException('Export cancelled', 'AbortError'));
      const timer = setTimeout(
        () => request.finish(new DocumentExportError('capture-failed')),
        30_000,
      );
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
  const [height, setHeight] = useState(1);
  const { input } = request;
  const fail = () => request.finish(new DocumentExportError('capture-failed'));

  const capture = async () => {
    if (request.nativeStarted || request.settled || !wrapper.current || !request.height) return;
    request.nativeStarted = true;
    try {
      const { captureWebp } = await import('../utils/captureWebp');
      if (request.settled) return;
      const result = await captureWebp(wrapper, input.signal);
      request.finish(undefined, {
        ...result,
        width: PixelRatio.getPixelSizeForLayoutSize(input.width),
        height: PixelRatio.getPixelSizeForLayoutSize(request.height),
      });
    } catch {
      fail();
    } finally {
      if (captureLease === request) captureLease = undefined;
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
        if (request.height && Math.abs(nativeEvent.layout.height - request.height) < 1) {
          webView.current?.injectJavaScript(readinessScript(request.id, 'ready'));
        }
      }}
      style={{ width: input.width, height }}
    >
      <WebView
        ref={webView}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        bounces={false}
        incognito
        injectedJavaScript={readinessScript(request.id, 'measure')}
        javaScriptCanOpenWindowsAutomatically={false}
        onContentProcessDidTerminate={fail}
        onError={fail}
        onMessage={({ nativeEvent }) => {
          if (request.settled || nativeEvent.data.length > 1024) return;
          try {
            const message = JSON.parse(nativeEvent.data);
            if (message.id !== request.id) return;
            if (message.error) {
              fail();
              return;
            }
            const measured = Math.ceil(message.height);
            const pixelWidth = PixelRatio.getPixelSizeForLayoutSize(input.width);
            const pixelHeight = PixelRatio.getPixelSizeForLayoutSize(measured);
            const pixels = pixelWidth * pixelHeight;
            if (
              typeof message.height !== 'number' ||
              !Number.isFinite(message.width) ||
              !Number.isFinite(measured) ||
              measured < 1 ||
              measured > input.maxHeight ||
              pixelWidth > 16383 ||
              pixelHeight > 16383 ||
              pixels > input.maxPixels ||
              message.width > input.width + 1
            ) {
              request.finish(new DocumentExportError('size-limit'));
              return;
            }
            if (message.phase === 'measure') {
              request.height = measured;
              setHeight(measured);
            } else if (message.phase === 'ready' && measured === request.height) void capture();
            else fail();
          } catch {
            fail();
          }
        }}
        onRenderProcessGone={fail}
        onShouldStartLoadWithRequest={({ url }) => url === 'about:blank'}
        originWhitelist={['*']}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled={false}
        source={{ html: input.html }}
        style={{ width: input.width, height }}
        textZoom={100}
        thirdPartyCookiesEnabled={false}
      />
    </View>
  );
}

function readinessScript(id: number, phase: 'measure' | 'ready') {
  return `(async function(){try{
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(function(image){return image.decode();}));
    var previous=-1, stable=0;
    for(var frame=0;frame<60;frame++){
      await new Promise(requestAnimationFrame);
      var main=document.querySelector('main');
      var height=Math.ceil(main.getBoundingClientRect().height);
      stable=height===previous?stable+1:0;previous=height;
      if(stable>=3){window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},phase:'${phase}',height:height,width:main.scrollWidth}));return;}
    }
    throw new Error('Layout unstable');
  }catch(error){window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},error:true}));}})();true;`;
}
