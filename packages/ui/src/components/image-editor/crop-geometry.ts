import type { ImageCrop, ImageEdit } from './image-editor.types';

export const FULL_IMAGE_CROP: ImageCrop = { x: 0, y: 0, width: 1, height: 1 };
export const INITIAL_IMAGE_EDIT: ImageEdit = {
  crop: FULL_IMAGE_CROP,
  rotation: 0,
  straighten: 0,
  horizontal: 0,
  vertical: 0,
  flipHorizontal: false,
  flipVertical: false,
};

/** Ratio is expressed in normalized frame coordinates, not source pixels. */
export function fitCrop(crop: ImageCrop, bounds: ImageCrop, ratio?: number): ImageCrop {
  const width = Math.min(crop.width, bounds.width, ratio ? bounds.height * ratio : Infinity);
  const height = ratio ? width / ratio : Math.min(crop.height, bounds.height);
  return {
    x: Math.max(
      bounds.x,
      Math.min(bounds.x + bounds.width - width, crop.x + (crop.width - width) / 2),
    ),
    y: Math.max(
      bounds.y,
      Math.min(bounds.y + bounds.height - height, crop.y + (crop.height - height) / 2),
    ),
    width,
    height,
  };
}
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
  bounds: ImageCrop = FULL_IMAGE_CROP,
  ratio?: number,
): ImageCrop {
  'worklet';
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  if (handle === 'move') {
    return {
      ...crop,
      x: clamp(crop.x + dx, bounds.x, bounds.x + bounds.width - crop.width),
      y: clamp(crop.y + dy, bounds.y, bounds.y + bounds.height - crop.height),
    };
  }
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;
  if (ratio) {
    const hasHorizontal = handle.includes('left') || handle.includes('right');
    const hasVertical = handle.includes('top') || handle.includes('bottom');
    const anchorX = handle.includes('left')
      ? right
      : handle.includes('right')
        ? left
        : left + crop.width / 2;
    const anchorY = handle.includes('top')
      ? bottom
      : handle.includes('bottom')
        ? top
        : top + crop.height / 2;
    const widthDelta = handle.includes('left') ? -dx : dx;
    const heightDelta = handle.includes('top') ? -dy : dy;
    const desired =
      hasHorizontal && (!hasVertical || Math.abs(dx) >= Math.abs(dy) * ratio)
        ? crop.width + widthDelta
        : (crop.height + heightDelta) * ratio;
    const availableWidth = hasHorizontal
      ? handle.includes('left')
        ? anchorX - bounds.x
        : bounds.x + bounds.width - anchorX
      : 2 * Math.min(anchorX - bounds.x, bounds.x + bounds.width - anchorX);
    const availableHeight = hasVertical
      ? handle.includes('top')
        ? anchorY - bounds.y
        : bounds.y + bounds.height - anchorY
      : 2 * Math.min(anchorY - bounds.y, bounds.y + bounds.height - anchorY);
    const maxWidth = Math.min(availableWidth, availableHeight * ratio);
    const width = clamp(
      desired,
      Math.min(maxWidth, Math.max(minWidth, minHeight * ratio)),
      maxWidth,
    );
    const height = width / ratio;
    return {
      x: hasHorizontal
        ? handle.includes('left')
          ? anchorX - width
          : anchorX
        : anchorX - width / 2,
      y: hasVertical ? (handle.includes('top') ? anchorY - height : anchorY) : anchorY - height / 2,
      width,
      height,
    };
  }
  if (handle.includes('left')) left = clamp(left + dx, bounds.x, right - minWidth);
  if (handle.includes('right')) right = clamp(right + dx, left + minWidth, bounds.x + bounds.width);
  if (handle.includes('top')) top = clamp(top + dy, bounds.y, bottom - minHeight);
  if (handle.includes('bottom'))
    bottom = clamp(bottom + dy, top + minHeight, bounds.y + bounds.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Rotate the selected pixels along with the source instead of discarding the crop. */
export function rotateImageEdit(edit: ImageEdit): ImageEdit {
  return {
    ...edit,
    rotation: ((edit.rotation + 90) % 360) as ImageEdit['rotation'],
    horizontal: -edit.vertical,
    vertical: edit.horizontal,
    flipHorizontal: edit.flipVertical,
    flipVertical: edit.flipHorizontal,
    crop: {
      x: Math.max(0, 1 - edit.crop.y - edit.crop.height),
      y: edit.crop.x,
      width: edit.crop.height,
      height: edit.crop.width,
    },
  };
}

export function mirrorImageEdit(edit: ImageEdit, axis: 'horizontal' | 'vertical'): ImageEdit {
  return axis === 'horizontal'
    ? {
        ...edit,
        flipHorizontal: !edit.flipHorizontal,
        horizontal: -edit.horizontal,
        crop: { ...edit.crop, x: Math.max(0, 1 - edit.crop.x - edit.crop.width) },
      }
    : {
        ...edit,
        flipVertical: !edit.flipVertical,
        vertical: -edit.vertical,
        crop: { ...edit.crop, y: Math.max(0, 1 - edit.crop.y - edit.crop.height) },
      };
}
