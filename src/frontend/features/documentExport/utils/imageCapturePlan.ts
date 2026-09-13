import {
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

/** Budget output pixels before allocating native views, without multiplying by screen density. */
export function imageCapturePlan(
  width: number,
  height: number,
  maxHeight: number,
  maxPixels: number,
): ImageCapturePlan {
  if (
    ![width, height, maxHeight, maxPixels].every((value) => Number.isFinite(value) && value > 0) ||
    height > maxHeight
  ) {
    throw new DocumentExportError('size-limit');
  }
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
    throw new DocumentExportError('size-limit');
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
