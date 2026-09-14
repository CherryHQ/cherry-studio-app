import {
  DOCUMENT_EXPORT_MAX_IMAGES,
  DOCUMENT_EXPORT_WEBP_MAX_DIMENSION,
  DocumentExportError,
} from '@/shared/contracts/documentExport';

const PREFERRED_SCALE = 2;
const TILE_PIXEL_HEIGHT = 1024;

export type ImageCaptureTile = { offset: number; height: number };
export type ImageCapturePlan = {
  width: number;
  height: number;
  scale: number;
  layoutHeight: number;
  tiles: ImageCaptureTile[];
};
export type ImageCapturePage = ImageCapturePlan & { offset: number };

/** Keep short documents in one image; paginate longer ones at measured message/line boundaries. */
export function imageCapturePages(
  width: number,
  height: number,
  maxHeight: number,
  maxPixels: number,
  sections: readonly number[],
  lineBreaks: readonly number[],
): ImageCapturePage[] {
  try {
    return [{ ...imageCapturePlan(width, height, maxHeight, maxPixels), offset: 0 }];
  } catch (error) {
    if (!(error instanceof DocumentExportError) || error.code !== 'image-size-limit') throw error;
  }
  // Multiple images keep the preferred scale instead of shrinking the complete conversation.
  const pageHeight = Math.floor(
    Math.min(
      maxHeight,
      DOCUMENT_EXPORT_WEBP_MAX_DIMENSION / PREFERRED_SCALE,
      maxPixels / (width * PREFERRED_SCALE ** 2),
    ),
  );
  if (pageHeight < 1) throw new DocumentExportError('image-size-limit');
  const boundaries = (values: readonly number[]) =>
    [
      ...new Set(values.filter((value) => Number.isFinite(value) && value > 0 && value < height)),
    ].sort((a, b) => a - b);
  const messageEnds = boundaries(sections);
  const lines = boundaries(lineBreaks);
  const pages: ImageCapturePage[] = [];
  let offset = 0;
  while (offset < height) {
    if (pages.length >= DOCUMENT_EXPORT_MAX_IMAGES)
      throw new DocumentExportError('image-size-limit');
    const limit = Math.min(height, offset + pageHeight);
    const end =
      limit === height
        ? height
        : (lastBoundary(messageEnds, offset, limit) ?? lastBoundary(lines, offset, limit) ?? limit);
    pages.push({
      ...imageCapturePlan(width, end - offset, maxHeight, maxPixels),
      offset,
      layoutHeight: height,
    });
    offset = end;
  }
  return pages;
}

function lastBoundary(values: readonly number[], start: number, limit: number) {
  let left = 0;
  let right = values.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    if (values[middle] <= limit) left = middle + 1;
    else right = middle;
  }
  const value = values[left - 1];
  return value > start ? value : undefined;
}

/** Budget output pixels before allocating native views, without multiplying by screen density. */
export function imageCapturePlan(
  width: number,
  height: number,
  maxHeight: number,
  maxPixels: number,
): ImageCapturePlan {
  if (
    ![width, height, maxHeight, maxPixels].every((value) => Number.isFinite(value) && value > 0)
  ) {
    throw new DocumentExportError('capture-failed');
  }
  if (height > maxHeight) throw new DocumentExportError('image-size-limit');
  const scale = Math.min(
    PREFERRED_SCALE,
    DOCUMENT_EXPORT_WEBP_MAX_DIMENSION / width,
    DOCUMENT_EXPORT_WEBP_MAX_DIMENSION / height,
    Math.sqrt(maxPixels / (width * height)),
  );
  let pixelWidth = Math.floor(width * scale);
  if (pixelWidth * Math.ceil((height * pixelWidth) / width) > maxPixels) pixelWidth -= 1;
  // Keep both axes at the same effective scale after rounding the width to whole pixels.
  const effectiveScale = pixelWidth / width;
  const pixelHeight = Math.ceil(height * effectiveScale);
  if (
    effectiveScale < 1 ||
    pixelHeight > DOCUMENT_EXPORT_WEBP_MAX_DIMENSION ||
    pixelWidth * pixelHeight > maxPixels
  ) {
    throw new DocumentExportError('image-size-limit');
  }
  const tiles: ImageCaptureTile[] = [];
  for (let offset = 0; offset < pixelHeight; offset += TILE_PIXEL_HEIGHT) {
    tiles.push({ offset, height: Math.min(TILE_PIXEL_HEIGHT, pixelHeight - offset) });
  }
  return {
    width: pixelWidth,
    height: pixelHeight,
    scale: effectiveScale,
    layoutHeight: height,
    tiles,
  };
}
