import type { HtmlCaptureSource } from '@/frontend/components/HtmlCapture';
import { DocumentExportError, type HtmlConversionFormat } from '@/shared/contracts/documentExport';

import { HTML_CAPTURE_HEIGHT, HTML_CAPTURE_WIDTH, parseHtmlCapturePages } from './htmlCapturePlan';
import { htmlCapturePageScript, htmlCaptureSetupScript } from './htmlCaptureScript';

export function htmlConversionCaptureSource(
  html: string,
  format: HtmlConversionFormat,
  id: number,
  density: number,
): HtmlCaptureSource {
  return {
    html,
    viewport: { width: HTML_CAPTURE_WIDTH / density, height: HTML_CAPTURE_HEIGHT / density },
    contentMode: 'desktop',
    setupScript: htmlCaptureSetupScript(id, format, density),
    maxMessageLength: 16_384,
    timeout: { totalMs: 180_000 },
    readFrames(message) {
      if (message.phase !== 'measured') return;
      const pages = parseHtmlCapturePages(message.pages);
      if (format === 'image' && pages.length !== 1) throw new DocumentExportError('capture-failed');
      return pages.map((page, index) => ({
        width: page.width,
        height: page.height,
        script: htmlCapturePageScript(id, index, page, density),
      }));
    },
  };
}
