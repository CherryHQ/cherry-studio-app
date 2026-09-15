import { DocumentExportError } from '@/shared/contracts/documentExport';

const CAPTURE_SCALE = 2;

export type ImageCapturePlan = {
  width: number;
  height: number;
  scale: number;
  layoutHeight: number;
};

/** Keep fixed 2x clarity, independent of screen density or document length. */
export function imageCapturePlan(width: number, height: number): ImageCapturePlan {
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) {
    throw new DocumentExportError('capture-failed');
  }
  const pixelWidth = Math.ceil(width * CAPTURE_SCALE);
  const pixelHeight = Math.ceil(height * CAPTURE_SCALE);
  if (!Number.isSafeInteger(pixelWidth) || !Number.isSafeInteger(pixelHeight))
    throw new DocumentExportError('capture-failed');
  return {
    width: pixelWidth,
    height: pixelHeight,
    scale: CAPTURE_SCALE,
    layoutHeight: height,
  };
}
