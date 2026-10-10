import type { ImageCrop, ImageEdit } from './image-editor.types';

export const FULL_IMAGE_CROP: ImageCrop = { x: 0, y: 0, width: 1, height: 1 };
export type CropHandle =
  | 'move'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

/** Fractions keep the selection stable across layout changes and avoid display-pixel rounding. */
export function moveCrop(
  crop: ImageCrop,
  handle: CropHandle,
  dx: number,
  dy: number,
  minWidth: number,
  minHeight: number,
): ImageCrop {
  'worklet';
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  if (handle === 'move') {
    return {
      ...crop,
      x: clamp(crop.x + dx, 0, 1 - crop.width),
      y: clamp(crop.y + dy, 0, 1 - crop.height),
    };
  }
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;
  if (handle.includes('left')) left = clamp(left + dx, 0, right - minWidth);
  if (handle.includes('right')) right = clamp(right + dx, left + minWidth, 1);
  if (handle.includes('top')) top = clamp(top + dy, 0, bottom - minHeight);
  if (handle.includes('bottom')) bottom = clamp(bottom + dy, top + minHeight, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Rotate the selected pixels along with the source instead of discarding the crop. */
export function rotateImageEdit(edit: ImageEdit): ImageEdit {
  return {
    rotation: ((edit.rotation + 90) % 360) as ImageEdit['rotation'],
    crop: {
      x: Math.max(0, 1 - edit.crop.y - edit.crop.height),
      y: edit.crop.x,
      width: edit.crop.height,
      height: edit.crop.width,
    },
  };
}
