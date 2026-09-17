import { useMemo, useState } from 'react';
import { FlatList, PixelRatio, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { ZoomableImage } from '../ArtifactImageViewer/ZoomableImage';

export type ArtifactImagePage = { uri: string; width: number; height: number; label: string };
const ORIGINAL_IMAGE_PIXELS = 6_000_000;

export function ArtifactImagePages({
  images,
  onError,
  onZoomChange,
  width,
}: {
  images: readonly ArtifactImagePage[];
  onError(): void;
  onZoomChange?(isZoomed: boolean): void;
  width: number;
}) {
  const [zoomedUri, setZoomedUri] = useState<string>();
  const first = images[0];
  const isLongImage = images.length === 1 && first.width * first.height > ORIGINAL_IMAGE_PIXELS;
  // A single long PNG stays inside the browser's viewport. Paged output can safely
  // retain its original pixels in bounded image views, including while scrolling.
  const singleSource = useMemo(() => {
    if (!first || !isLongImage) return undefined;
    return { uri: first.uri };
  }, [first, isLongImage]);
  if (singleSource) {
    return (
      <WebView
        accessibilityLabel={first.label}
        allowingReadAccessToURL={singleSource.uri}
        allowFileAccess
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        injectedJavaScript={`(function(){try{
          var viewport=document.createElement('meta');viewport.name='viewport';
          viewport.content='width=device-width,initial-scale=1';document.head.appendChild(viewport);
          document.documentElement.style.cssText='margin:0;padding:0;width:100%';
          document.body.style.cssText='margin:0;padding:0;width:100%';
          var image=document.images[0];
          image.style.cssText='display:block;width:100%;height:auto;max-width:none;margin:0';
          image.decode().catch(function(){window.ReactNativeWebView.postMessage('image-error');});
        }catch(error){window.ReactNativeWebView.postMessage('image-error');}})();true;`}
        javaScriptCanOpenWindowsAutomatically={false}
        onContentProcessDidTerminate={onError}
        onError={onError}
        onMessage={({ nativeEvent }) => {
          if (nativeEvent.data === 'image-error') onError();
        }}
        onRenderProcessGone={onError}
        onShouldStartLoadWithRequest={({ url }) =>
          url === 'about:blank' || url === singleSource.uri
        }
        originWhitelist={['about:blank', 'file://*']}
        source={singleSource}
        style={{ width, alignSelf: 'center', backgroundColor: 'transparent' }}
      />
    );
  }
  return (
    <FlatList
      data={images}
      scrollEnabled={!zoomedUri}
      initialNumToRender={1}
      keyExtractor={(page) => page.uri}
      maxToRenderPerBatch={2}
      windowSize={3}
      contentContainerClassName="items-center gap-4 py-4"
      renderItem={({ item }) => {
        const pageWidth = Math.min(width, item.width / PixelRatio.get());
        const pageHeight = (pageWidth * item.height) / item.width;
        return (
          <View className="gap-2" style={{ width: pageWidth }}>
            {images.length > 1 ? (
              <Text className="text-center text-muted-foreground text-sm">{item.label}</Text>
            ) : null}
            <View className="overflow-hidden" style={{ width: pageWidth, height: pageHeight }}>
              <ZoomableImage
                accessibilityLabel={item.label}
                height={pageHeight}
                width={pageWidth}
                uri={item.uri}
                sourceResolution={
                  item.width * item.height <= ORIGINAL_IMAGE_PIXELS ? 'original' : 'display'
                }
                onError={onError}
                onZoomChange={(isZoomed) => {
                  setZoomedUri(isZoomed ? item.uri : undefined);
                  onZoomChange?.(isZoomed);
                }}
              />
            </View>
          </View>
        );
      }}
    />
  );
}
