import { DocumentExportError, type ExportImageLayout } from '@/shared/contracts/documentExport';

export const IMAGE_LAYOUT_WIDTH = 360;
export const IMAGE_PAGE_HEIGHT = 1200;
export const IMAGE_PAGE_TOP_INSET = 16;

export type ImagePageSlice = { top: number; height: number };
export type ImagePageMeasurement = {
  height: number;
  width: number;
  sections: number[];
  blocks: number[];
  ink: [number, number][];
};

/** Break at message/paragraph boundaries when possible, otherwise in a gap between painted lines. */
export function imagePagePlan(
  measurement: ImagePageMeasurement,
  layout: ExportImageLayout,
): ImagePageSlice[] {
  const { height, width, sections, blocks, ink } = measurement;
  if (
    !Number.isSafeInteger(height) ||
    height < 1 ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Array.isArray(sections) ||
    !Array.isArray(blocks) ||
    !Array.isArray(ink) ||
    ![...sections, ...blocks].every(
      (value) => Number.isFinite(value) && value >= 0 && value <= height,
    ) ||
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
  const orderedSections = [...new Set(sections.map(Math.ceil))].sort((a, b) => a - b);
  const orderedBlocks = [...new Set(blocks.map(Math.ceil))].sort((a, b) => a - b);
  const pages: ImagePageSlice[] = [];
  let top = 0;
  while (top < height) {
    let end = Math.min(top + IMAGE_PAGE_HEIGHT, height);
    if (end < height) {
      const minimum = top + IMAGE_PAGE_HEIGHT * 0.6;
      const preferred = (boundaries: number[]) => {
        // Each list is sorted; walk backwards only through candidates for this page.
        let low = 0;
        let high = boundaries.length;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (boundaries[middle] <= end) low = middle + 1;
          else high = middle;
        }
        for (let index = low - 1; index >= 0 && boundaries[index] >= minimum; index--) {
          const candidate = safeCut(boundaries[index]);
          if (candidate >= minimum) return candidate;
        }
        return undefined;
      };
      end = preferred(orderedSections) ?? preferred(orderedBlocks) ?? safeCut(end);
    }
    // Never hide, omit or cut through a painted object that cannot fit on one page.
    if (end <= top) throw new DocumentExportError('capture-failed');
    pages.push({ top, height: end - top });
    top = end;
  }
  return pages;
}
