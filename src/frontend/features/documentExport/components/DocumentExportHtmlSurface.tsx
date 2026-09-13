import { useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { DocumentExportError, type CaptureExportHtml } from '@/shared/contracts/documentExport';

// Bundle Mode needs the encoder worklet in the initial bundle, not an async chunk.
import { captureWebp } from '../utils/captureWebp';
import {
  imageCapturePlan,
  type ImageCapturePlan,
  type ImageCaptureTile,
} from '../utils/imageCapturePlan';

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
    // Superseded previews wait for late native cleanup before starting another tile job.
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

type TileLayout = { plan: ImageCapturePlan; tile: ImageCaptureTile };
type PendingTile = TileLayout & { injected: boolean; resolve(): void; reject(): void };

function CaptureSurface({ request }: { request: CaptureRequest }) {
  const wrapper = useRef<View>(null);
  const webView = useRef<WebView>(null);
  const layout = useRef({ width: 0, height: 0 });
  const pending = useRef<PendingTile | undefined>(undefined);
  const [tileLayout, setTileLayout] = useState<TileLayout>();
  const { input } = request;
  const density = PixelRatio.get();
  const width = tileLayout ? tileLayout.plan.width / density : input.width;
  const height = tileLayout ? tileLayout.tile.height / density : 1;
  const fail = () => request.finish(new DocumentExportError('capture-failed'));

  const prepareLayout = useCallback(() => {
    const job = pending.current;
    if (!job || job.injected || request.settled) return;
    if (
      Math.abs(layout.current.width * density - job.plan.width) > 1 ||
      Math.abs(layout.current.height * density - job.tile.height) > 1
    )
      return;
    job.injected = true;
    webView.current?.injectJavaScript(tileReadinessScript(request.id, input.width, job, density));
  }, [density, input.width, request]);
  useEffect(() => {
    prepareLayout();
  }, [prepareLayout, tileLayout]);

  const capture = async (plan: ImageCapturePlan) => {
    if (request.nativeStarted || request.settled) return;
    request.nativeStarted = true;
    const signal = request.controller.signal;
    const prepareTile = (tile: ImageCaptureTile) =>
      new Promise<void>((resolve, reject) => {
        signal.throwIfAborted();
        const abort = () => {
          pending.current = undefined;
          reject(new DOMException('Export cancelled', 'AbortError'));
        };
        signal.addEventListener('abort', abort, { once: true });
        pending.current = {
          plan,
          tile,
          injected: false,
          resolve: () => {
            signal.removeEventListener('abort', abort);
            pending.current = undefined;
            resolve();
          },
          reject: abort,
        };
        setTileLayout({ plan, tile });
      });
    try {
      const result = await captureWebp(wrapper, plan, prepareTile, signal);
      request.finish(undefined, { ...result, width: plan.width, height: plan.height });
    } catch {
      fail();
    } finally {
      pending.current?.reject();
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
          if (request.settled || nativeEvent.data.length > 1024) return;
          try {
            const message = JSON.parse(nativeEvent.data);
            if (message.id !== request.id) return;
            if (message.error) {
              fail();
              return;
            }
            if (message.phase === 'ready') {
              const job = pending.current;
              if (
                job &&
                message.offset === job.tile.offset &&
                Math.abs(message.height - job.plan.layoutHeight) <= 1
              ) {
                job.resolve();
              } else fail();
              return;
            }
            if (message.phase !== 'measure' || request.nativeStarted) return;
            if (
              !Number.isFinite(message.width) ||
              message.width > input.width + 1 ||
              typeof message.height !== 'number'
            ) {
              request.finish(new DocumentExportError('size-limit'));
              return;
            }
            const plan = imageCapturePlan(
              input.width,
              Math.ceil(message.height),
              input.maxHeight,
              input.maxPixels,
            );
            request.finished = capture(plan);
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

function tileReadinessScript(
  id: number,
  width: number,
  { plan, tile }: TileLayout,
  density: number,
) {
  // The native view is only one output tile at device density. Keep the original
  // document width and translate the same layout, so no text is reflowed at seams.
  return `(async function(){try{
    document.documentElement.style.cssText='overflow:hidden;height:100%';
    document.body.style.cssText='overflow:hidden;height:100%;margin:0';
    var main=document.querySelector('main');
    main.style.width='${width}px';main.style.maxWidth='none';main.style.margin='0';
    main.style.position='absolute';main.style.left='0';main.style.top='0';
    main.style.transformOrigin='0 0';
    main.style.transform='matrix(${plan.scale / density},0,0,${plan.scale / density},0,${-tile.offset / density})';
    for(var frame=0;frame<3;frame++) await new Promise(requestAnimationFrame);
    window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},phase:'ready',offset:${tile.offset},height:main.offsetHeight}));
  }catch(error){window.ReactNativeWebView.postMessage(JSON.stringify({id:${id},error:true}));}})();true;`;
}
