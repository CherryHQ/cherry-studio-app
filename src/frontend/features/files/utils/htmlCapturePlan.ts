import {
  DocumentExportError,
  HTML_CONVERSION_MAX_EDGE,
  HTML_CONVERSION_MAX_PAGES,
  HTML_CONVERSION_MAX_PIXELS,
} from '@/shared/contracts/documentExport';

export const HTML_CAPTURE_WIDTH = 1280;
export const HTML_CAPTURE_HEIGHT = 720;
export type HtmlCapturePage = { x: number; y: number; width: number; height: number };

/** All geometry comes from authored HTML. Admit it before allocating native surfaces. */
export function parseHtmlCapturePages(value: unknown): HtmlCapturePage[] {
  if (!Array.isArray(value) || !value.length || value.length > HTML_CONVERSION_MAX_PAGES)
    throw new DocumentExportError('image-size-limit');
  return value.map((page: unknown) => {
    if (!page || typeof page !== 'object') throw new DocumentExportError('capture-failed');
    const { x, y, width, height } = page as HtmlCapturePage;
    if (
      ![x, y, width, height].every(Number.isSafeInteger) ||
      x < 0 ||
      y < 0 ||
      x > HTML_CONVERSION_MAX_EDGE ||
      y > HTML_CONVERSION_MAX_EDGE * HTML_CONVERSION_MAX_PAGES ||
      width < 1 ||
      height < 1 ||
      width > HTML_CONVERSION_MAX_EDGE ||
      height > HTML_CONVERSION_MAX_EDGE ||
      width * height > HTML_CONVERSION_MAX_PIXELS
    )
      throw new DocumentExportError('image-size-limit');
    return { x, y, width, height };
  });
}
