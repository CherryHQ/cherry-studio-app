import { useCallback, useEffect, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';

import { useHtmlCapture } from '@/frontend/components/HtmlCapture';
import { DocumentExportError, type CaptureExportHtml } from '@/shared/contracts/documentExport';

import {
  IMAGE_CAPTURE_SCALE,
  imageCapturePlan,
  imageCaptureTiles,
  type ImageCaptureTile,
} from '../utils/imageCapturePlan';
import { imageMeasurementScript, imagePageReadinessScript } from '../utils/imageCaptureScripts';
import {
  IMAGE_PAGE_TOP_INSET,
  imagePagePlan,
  type ImagePageMeasurement,
} from '../utils/imagePagePlan';
import { stitchCapturedPngPages } from '../utils/stitchCapturedPngPages';

export function useDocumentExportHtmlCapture() {
  const { capture: captureHtml, surface } = useHtmlCapture();
  const viewport = useRef<{ width: number; height: number } | undefined>(undefined);
  const layoutWaiters = useRef(new Set<() => void>());
  const pending = useRef(new Map<AbortController, { width: number; height: number } | undefined>());
  const onCaptureLayout = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    const previous = viewport.current;
    if (previous?.width === layout.width && previous.height === layout.height) return;
    viewport.current = { width: layout.width, height: layout.height };
    // Never publish tiles captured against a viewport that changed midway through the operation.
    for (const [controller, bounds] of pending.current) {
      if (bounds && (bounds.width !== layout.width || bounds.height !== layout.height))
        controller.abort();
    }
    if (layout.width > 0 && layout.height > 0) {
      for (const ready of layoutWaiters.current) ready();
    }
  }, []);
  useEffect(() => {
    const controllers = pending.current;
    return () => {
      for (const controller of controllers.keys()) controller.abort();
    };
  }, []);
  const capture = useCallback<CaptureExportHtml>(
    async (input) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      input.signal.throwIfAborted();
      input.signal.addEventListener('abort', abort, { once: true });
      pending.current.set(controller, undefined);
      let tiles: ImageCaptureTile[] = [];
      const capturePages = (onPage: Parameters<typeof captureHtml>[0]['onPage']) =>
        captureHtml({
          signal: controller.signal,
          onPage,
          source: ({ id, density }) => ({
            html: input.html,
            viewport: { width: input.width, height: 1 },
            contentMode: 'mobile',
            setupScript: imageMeasurementScript(id, input.layout),
            maxMessageLength: 2_000_000,
            timeout: { pageMs: 60_000 },
            readFrames(message) {
              if (message.phase !== 'measure') return;
              if (typeof message.width !== 'number' || message.width > input.width + 1)
                throw new DocumentExportError('capture-failed');
              const pages = imagePagePlan(message as ImagePageMeasurement, input.layout);
              if (input.layout === 'single') {
                const captureViewport = viewport.current;
                if (!captureViewport) throw new DocumentExportError('capture-failed');
                pending.current.set(controller, captureViewport);
                tiles = imageCaptureTiles(input.width, pages[0].height, captureViewport, density);
              } else {
                tiles = pages.map((page) => ({ ...page, left: 0, width: input.width }));
              }
              return tiles.map((slice, index) => {
                const plan = imageCapturePlan(
                  slice.width,
                  slice.height + (input.layout === 'pages' ? IMAGE_PAGE_TOP_INSET : 0),
                );
                return {
                  width: plan.width,
                  height: plan.height,
                  script: imagePageReadinessScript(
                    id,
                    index,
                    input.width,
                    slice,
                    plan,
                    density,
                    input.layout,
                    slice.left,
                  ),
                };
              });
            },
          }),
        });

      try {
        if (input.layout === 'pages') {
          return await capturePages((page, index, total) =>
            input.onPage({ uri: page.uri, width: page.width, height: page.height, index, total }),
          );
        }

        if (!viewport.current || viewport.current.width <= 0 || viewport.current.height <= 0) {
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              layoutWaiters.current.delete(ready);
              controller.signal.removeEventListener('abort', cancelled);
            };
            const ready = () => {
              cleanup();
              resolve();
            };
            const cancelled = () => {
              cleanup();
              reject(new DOMException('Capture cancelled', 'AbortError'));
            };
            layoutWaiters.current.add(ready);
            controller.signal.addEventListener('abort', cancelled, { once: true });
            if (controller.signal.aborted) cancelled();
          });
        }
        controller.signal.throwIfAborted();
        const image = await stitchCapturedPngPages(
          (onPage) =>
            capturePages((page, index, total, signal) => {
              const tile = tiles[index];
              const plan = imageCapturePlan(tile.width, tile.height);
              // A rounded native screenshot must not introduce seams or shift later tiles.
              if (page.width !== plan.width || page.height !== plan.height)
                throw new DocumentExportError('capture-failed');
              return onPage(
                {
                  ...page,
                  left: tile.left * IMAGE_CAPTURE_SCALE,
                  top: tile.top * IMAGE_CAPTURE_SCALE,
                },
                index,
                total,
                signal,
              );
            }),
          controller.signal,
        );
        try {
          controller.signal.throwIfAborted();
          await input.onPage({
            uri: image.uri,
            width: image.width,
            height: image.height,
            index: 0,
            total: 1,
          });
          controller.signal.throwIfAborted();
        } finally {
          image.release();
        }
      } finally {
        pending.current.delete(controller);
        input.signal.removeEventListener('abort', abort);
      }
    },
    [captureHtml],
  );
  return { capture, surface, onCaptureLayout };
}
