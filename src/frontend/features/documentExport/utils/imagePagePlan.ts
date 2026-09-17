import {
  DocumentExportError,
  HTML_CONVERSION_MAX_EDGE,
  type ExportImageLayout,
} from '@/shared/contracts/documentExport';

import { IMAGE_CAPTURE_SCALE } from './imageCapturePlan';

export const IMAGE_LAYOUT_WIDTH = 360;
export const IMAGE_PAGE_TOP_INSET = 16;
// Fill the same physical edge budget as HTML image conversion, including page spacing.
export const IMAGE_PAGE_HEIGHT =
  Math.floor(HTML_CONVERSION_MAX_EDGE / IMAGE_CAPTURE_SCALE) - IMAGE_PAGE_TOP_INSET;

export type ImagePageSlice = { top: number; height: number };
export type ImagePageMeasurement = {
  height: number;
  width: number;
  ink: [number, number][];
};

/** Fill each image to its capture limit, moving the cut only to avoid painted content. */
export function imagePagePlan(
  measurement: ImagePageMeasurement,
  layout: ExportImageLayout,
): ImagePageSlice[] {
  const { height, width, ink } = measurement;
  if (
    !Number.isSafeInteger(height) ||
    height < 1 ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Array.isArray(ink) ||
    !ink.every(
      (range) =>
        Array.isArray(range) &&
        range.length === 2 &&
        range.every(Number.isFinite) &&
        range[0] >= 0 &&
        range[1] >= range[0] &&
        range[1] <= height,
    )
  )
    throw new DocumentExportError('capture-failed');
  if (layout === 'single') return [{ top: 0, height }];

  const ranges: [number, number][] = [];
  for (const [top, bottom] of [...ink].sort((a, b) => a[0] - b[0])) {
    const previous = ranges.at(-1);
    if (previous && top < previous[1]) previous[1] = Math.max(previous[1], bottom);
    else ranges.push([top, bottom]);
  }
  const safeCut = (end: number) => {
    let low = 0;
    let high = ranges.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (ranges[middle][0] < end) low = middle + 1;
      else high = middle;
    }
    const range = ranges[low - 1];
    return range && end < range[1] ? Math.floor(range[0]) : Math.floor(end);
  };
  const pages: ImagePageSlice[] = [];
  let top = 0;
  while (top < height) {
    let end = Math.min(top + IMAGE_PAGE_HEIGHT, height);
    if (end < height) end = safeCut(end);
    // Never hide, omit or cut through a painted object that cannot fit on one page.
    if (end <= top) throw new DocumentExportError('capture-failed');
    pages.push({ top, height: end - top });
    top = end;
  }
  return pages;
}
