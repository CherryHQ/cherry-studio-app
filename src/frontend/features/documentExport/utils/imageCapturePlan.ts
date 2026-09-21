import { DocumentExportError } from '@/shared/contracts/documentExport';

export const IMAGE_CAPTURE_SCALE = 3;

export type ImageCapturePlan = {
  width: number;
  height: number;
  scale: number;
  layoutHeight: number;
};

export type ImageCaptureTile = { left: number; top: number; width: number; height: number };

/** Keep native capture bounds inside the measured container without reducing output density. */
export function imageCaptureTiles(
  width: number,
  height: number,
  viewport: { width: number; height: number },
  density: number,
): ImageCaptureTile[] {
  imageCapturePlan(width, height);
  if (
    ![viewport.width, viewport.height, density].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    throw new DocumentExportError('capture-failed');
  // Reserve one physical pixel for native layout rounding at either container edge.
  const tileWidth = Math.floor((viewport.width * density - 1) / IMAGE_CAPTURE_SCALE);
  const tileHeight = Math.floor((viewport.height * density - 1) / IMAGE_CAPTURE_SCALE);
  if (tileWidth < 1 || tileHeight < 1) throw new DocumentExportError('capture-failed');
  const tiles: ImageCaptureTile[] = [];
  for (let top = 0; top < height; top += tileHeight) {
    for (let left = 0; left < width; left += tileWidth) {
      tiles.push({
        left,
        top,
        width: Math.min(tileWidth, width - left),
        height: Math.min(tileHeight, height - top),
      });
    }
  }
  return tiles;
}

/** Fixed output density; page count grows with content instead of reducing text resolution. */
export function imageCapturePlan(width: number, height: number): ImageCapturePlan {
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) {
    throw new DocumentExportError('capture-failed');
  }
  const pixelWidth = Math.ceil(width * IMAGE_CAPTURE_SCALE);
  const pixelHeight = Math.ceil(height * IMAGE_CAPTURE_SCALE);
  if (!Number.isSafeInteger(pixelWidth) || !Number.isSafeInteger(pixelHeight))
    throw new DocumentExportError('capture-failed');
  return {
    width: pixelWidth,
    height: pixelHeight,
    scale: IMAGE_CAPTURE_SCALE,
    layoutHeight: height,
  };
}
