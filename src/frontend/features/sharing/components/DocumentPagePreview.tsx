import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

import type { ExportImageLayout } from '@/shared/contracts/documentExport';

import { imageMeasurementScript } from '../utils/imageCaptureScripts';
import {
  imagePagePlan,
  IMAGE_LAYOUT_WIDTH,
  IMAGE_PAGE_TOP_INSET,
  type ImagePageSlice,
} from '../utils/imagePagePlan';

export function DocumentPagePreview({
  html,
  page,
  width: frameWidth,
  height: frameHeight,
  bottomInset,
  isImage,
  layout,
  onPages,
  onError,
}: {
  html: string;
  page: ImagePageSlice;
  width: number;
  height: number;
  bottomInset: number;
  isImage: boolean;
  layout: ExportImageLayout;
  onPages(pages: readonly ImagePageSlice[]): void;
  onError(error?: unknown): void;
}) {
  const web = useRef<WebView<object>>(null);
  const [bounds, setBounds] = useState<{ width: number; height: number }>();
  const width = bounds?.width ?? frameWidth;
  const height = bounds?.height ?? frameHeight;
  const source = useMemo(() => ({ html }), [html]);
  const topInset = layout === 'single' ? 0 : IMAGE_PAGE_TOP_INSET;
  const pageHeight = page.height + topInset;
  const isPagedImage = isImage && layout === 'pages';
  const availableHeight = Math.max(1, height - bottomInset);
  const scale = isPagedImage
    ? Math.min(width / IMAGE_LAYOUT_WIDTH, availableHeight / pageHeight)
    : width / IMAGE_LAYOUT_WIDTH;
  const viewportHeight = isPagedImage ? pageHeight : height / scale;
  // Preview-only clearance never changes the main element measured for exported pages.
  const position = isPagedImage
    ? `document.documentElement.style.overflow='hidden';document.body.style.cssText='margin:0;overflow:hidden;height:100%';var main=document.querySelector('main');if(main){main.style.cssText='position:absolute;left:0;top:${topInset - page.top}px;width:${IMAGE_LAYOUT_WIDTH}px;max-width:none;margin:0'}true;`
    : `document.body.style.paddingBottom='${bottomInset / scale}px';true;`;
  useEffect(() => {
    web.current?.injectJavaScript(position);
  }, [position]);
  return (
    <View
      className="flex-1 overflow-hidden bg-card"
      onLayout={({ nativeEvent: { layout } }) =>
        setBounds((current) =>
          current?.width === layout.width && current.height === layout.height
            ? current
            : { width: layout.width, height: layout.height },
        )
      }
    >
      <View
        style={{
          position: 'absolute',
          left: (width - IMAGE_LAYOUT_WIDTH * scale) / 2,
          top: isPagedImage ? (availableHeight - pageHeight * scale) / 2 : 0,
          width: IMAGE_LAYOUT_WIDTH,
          height: viewportHeight,
          transform: [{ scale }],
          transformOrigin: 'top left',
        }}
        pointerEvents={isPagedImage ? 'none' : 'auto'}
      >
        <WebView<object>
          ref={web}
          source={source}
          originWhitelist={['*']}
          scrollEnabled={!isPagedImage}
          showsVerticalScrollIndicator={isImage && layout === 'single'}
          injectedJavaScript={`${position}${isImage ? imageMeasurementScript(1, layout) : ''}`}
          onError={onError}
          onHttpError={onError}
          onShouldStartLoadWithRequest={(request) =>
            request.url === 'about:blank' || request.url.startsWith('data:')
          }
          onMessage={(event) => {
            if (!isImage) return;
            try {
              const measurement = JSON.parse(event.nativeEvent.data);
              if (measurement.error) {
                onError();
                return;
              }
              if (measurement.phase !== 'measure') return;
              onPages(imagePagePlan(measurement, layout));
              if (isPagedImage) web.current?.injectJavaScript(position);
            } catch (error) {
              onError(error);
            }
          }}
          style={{ width: IMAGE_LAYOUT_WIDTH, height: viewportHeight }}
        />
      </View>
    </View>
  );
}
