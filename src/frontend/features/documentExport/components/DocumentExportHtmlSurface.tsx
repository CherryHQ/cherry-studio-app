import { useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { DocumentExportError, type CaptureExportHtml } from '@/shared/contracts/documentExport';

// Bundle Mode needs the encoder worklet in the initial bundle, not an async chunk.
import { captureWebp } from '../utils/captureWebp';
import { imageCapturePlan, type ImageCapturePlan } from '../utils/imageCapturePlan';

type CaptureInput = Parameters<CaptureExportHtml>[0];
type CaptureResult = Awaited<ReturnType<CaptureExportHtml>>;
type CaptureRequest = {
  input: CaptureInput;
  id: number;
  controller: AbortController;
  nativeStarted: boolean;
  finished?: Promise<void>;
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
  const capture = useCallback<CaptureExportHtml>(async (input) => {
    input.signal.throwIfAborted();
    // Superseded previews wait for late native cleanup before starting another capture.
    if (captureLease?.settled) await captureLease.finished;
    input.signal.throwIfAborted();
    if (!mounted.current) return Promise.reject(new DocumentExportError('disposed'));
    if (captureLease) return Promise.reject(new DocumentExportError('busy'));
    return new Promise<CaptureResult>((resolve, reject) => {
      const request: CaptureRequest = {
        input,
        id: ++nextId,
        controller: new AbortController(),
        nativeStarted: false,
        settled: false,
        finish: (error, result) => {
          if (request.settled) {
            result?.release();
            return;
          }
          request.settled = true;
          request.controller.abort();
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
        60_000,
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
  const layout = useRef({ width: 0, height: 0 });
  const injected = useRef(false);
  const [plan, setPlan] = useState<ImageCapturePlan>();
  const { input } = request;
  const density = PixelRatio.get();
  const width = plan ? plan.width / density : input.width;
  const height = plan ? plan.height / density : 1;
  const fail = () => request.finish(new DocumentExportError('capture-failed'));

  const prepareLayout = useCallback(() => {
    if (!plan || injected.current || request.settled) return;
    if (
      Math.abs(layout.current.width * density - plan.width) > 1 ||
      Math.abs(layout.current.height * density - plan.height) > 1
    )
      return;
    injected.current = true;
    webView.current?.injectJavaScript(
      captureReadinessScript(request.id, input.width, plan, density),
    );
  }, [density, input.width, plan, request]);
  useEffect(() => {
    prepareLayout();
  }, [prepareLayout]);

  const capture = async (plan: ImageCapturePlan) => {
    if (request.nativeStarted || request.settled) return;
    request.nativeStarted = true;
    try {
      const result = await captureWebp(wrapper, plan, request.controller.signal);
      request.finish(undefined, result);
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
        layout.current = nativeEvent.layout;
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
        injectedJavaScript={readinessScript(request.id)}
        javaScriptCanOpenWindowsAutomatically={false}
        onContentProcessDidTerminate={fail}
        onError={fail}
        onMessage={({ nativeEvent }) => {
          if (request.settled || request.nativeStarted || nativeEvent.data.length > 1024) return;
          try {
            const message = JSON.parse(nativeEvent.data);
            if (message.id !== request.id) return;
            if (message.error) {
              fail();
              return;
            }
            if (message.phase === 'ready') {
              if (
                plan &&
                injected.current &&
                typeof message.height === 'number' &&
                Math.abs(message.height - plan.layoutHeight) <= 1
              ) {
                request.finished = capture(plan);
              } else fail();
              return;
            }
            if (message.phase !== 'measure' || plan) return;
            if (
              !Number.isFinite(message.width) ||
              message.width > input.width + 1 ||
              typeof message.height !== 'number'
            ) {
              request.finish(new DocumentExportError('image-size-limit'));
              return;
            }
            setPlan(
              imageCapturePlan(
                input.width,
                Math.ceil(message.height),
                input.maxHeight,
                input.maxPixels,
              ),
            );
          } catch (error) {
            if (error instanceof DocumentExportError) request.finish(error);
            else fail();
          }
        }}
        onRenderProcessGone={fail}
        onShouldStartLoadWithRequest={({ url }) => url === 'about:blank'}
        originWhitelist={['*']}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled={false}
        source={{ html: input.html }}
        style={{ width, height }}
        textZoom={100}
        thirdPartyCookiesEnabled={false}
      />
    </View>
  );
}

function readinessScript(id: number) {
  return `(async function(){try{
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(function(image){return image.decode();}));
    var previous=-1, stable=0;
    for(var frame=0;frame<120;frame++){
      await new Promise(requestAnimationFrame);
      var main=document.querySelector('main');
      var height=Math.ceil(main.getBoundingClientRect().height);
      stable=height===previous?stable+1:0;previous=height;
      if(stable>=3){window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},phase:'measure',height:height,width:main.scrollWidth}));return;}
    }
    throw new Error('Layout unstable');
  }catch(error){window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},error:true}));}})();true;`;
}

function captureReadinessScript(
  id: number,
  width: number,
  plan: ImageCapturePlan,
  density: number,
) {
  // Size the full native view to the admitted output pixels. Scaling the original
  // CSS layout avoids reflow or allocating a bitmap at the device's higher density.
  return `(async function(){try{
    document.documentElement.style.cssText='overflow:hidden;height:100%';
    document.body.style.cssText='overflow:hidden;height:100%;margin:0';
    var main=document.querySelector('main');
    main.style.width='${width}px';main.style.maxWidth='none';main.style.margin='0';
    main.style.position='absolute';main.style.left='0';main.style.top='0';
    main.style.transformOrigin='0 0';
    main.style.transform='scale(${plan.scale / density})';
    for(var frame=0;frame<3;frame++) await new Promise(requestAnimationFrame);
    window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},phase:'ready',height:main.offsetHeight}));
  }catch(error){window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},error:true}));}})();true;`;
}
