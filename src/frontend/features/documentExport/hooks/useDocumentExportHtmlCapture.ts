import { useCallback } from 'react';

import { useHtmlCapture } from '@/frontend/components/HtmlCapture';
import { DocumentExportError, type CaptureExportHtml } from '@/shared/contracts/documentExport';

import { imageCapturePlan } from '../utils/imageCapturePlan';
import { imageMeasurementScript, imagePageReadinessScript } from '../utils/imageCaptureScripts';
import {
  IMAGE_PAGE_TOP_INSET,
  imagePagePlan,
  type ImagePageMeasurement,
} from '../utils/imagePagePlan';

export function useDocumentExportHtmlCapture() {
  const { capture: captureHtml, surface } = useHtmlCapture();
  const capture = useCallback<CaptureExportHtml>(
    (input) =>
      captureHtml({
        signal: input.signal,
        onPage: (page, index, total) =>
          input.onPage({ uri: page.uri, width: page.width, height: page.height, index, total }),
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
            return pages.map((slice, index) => {
              const plan = imageCapturePlan(
                input.width,
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
                ),
              };
            });
          },
        }),
      }),
    [captureHtml],
  );
  return { capture, surface };
}
