import { DocumentExportError } from '@/shared/contracts/documentExport';

export const IMAGE_CAPTURE_SCALE = 3;

/** Tall share cards use fewer pixels while retaining a readable 720px text column. */
export function imageCardCaptureScale(height: number) {
  return height > 2000 ? 2 : IMAGE_CAPTURE_SCALE;
}

export type ImageCapturePlan = {
  width: number;
  height: number;
  scale: number;
  layoutHeight: number;
};

export type ImageCaptureTile = { left: number; top: number; width: number; height: number };

/** Keep native capture bounds inside the measured container at the chosen output scale. */
export function imageCaptureTiles(
  width: number,
  height: number,
  viewport: { width: number; height: number },
  density: number,
  scale = IMAGE_CAPTURE_SCALE,
): ImageCaptureTile[] {
  imageCapturePlan(width, height, scale);
  if (
    ![viewport.width, viewport.height, density].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    throw new DocumentExportError('capture-failed');
  // Reserve one physical pixel for native layout rounding at either container edge.
  const tileWidth = Math.floor((viewport.width * density - 1) / scale);
  const tileHeight = Math.floor((viewport.height * density - 1) / scale);
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

/** Convert logical dimensions at the same output density for every tile. */
export function imageCapturePlan(
  width: number,
  height: number,
  scale = IMAGE_CAPTURE_SCALE,
): ImageCapturePlan {
  if (
    ![width, height].every((value) => Number.isFinite(value) && value > 0) ||
    ![2, 3].includes(scale)
  ) {
    throw new DocumentExportError('capture-failed');
  }
  const pixelWidth = Math.ceil(width * scale);
  const pixelHeight = Math.ceil(height * scale);
  if (!Number.isSafeInteger(pixelWidth) || !Number.isSafeInteger(pixelHeight))
    throw new DocumentExportError('capture-failed');
  return {
    width: pixelWidth,
    height: pixelHeight,
    scale,
    layoutHeight: height,
  };
}
