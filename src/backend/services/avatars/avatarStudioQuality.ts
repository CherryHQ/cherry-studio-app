import {
  compareImages,
  opaqueBounds,
  removeFlatBackground,
  type RgbaImage,
} from '@/backend/utils/rgbaImage';

/** Conservative structural gates. The user still reviews identity and expression before batching. */
export function validateAvatarBase(image: RgbaImage): void {
  const bounds = opaqueBounds(removeFlatBackground(image, 40));
  if (
    !bounds ||
    bounds.left < image.width * 0.02 ||
    bounds.top < image.height * 0.02 ||
    bounds.right > image.width * 0.98 ||
    bounds.bottom > image.height * 0.98 ||
    (bounds.right - bounds.left) * (bounds.bottom - bounds.top) < image.width * image.height * 0.15
  ) {
    throw new Error('avatar_framing');
  }
}

export function validateAvatarExpression(base: RgbaImage, edited: RgbaImage): void {
  if (base.width !== edited.width || base.height !== edited.height)
    throw new Error('avatar_alignment');
  const { changedRatio } = compareImages(base, edited, { threshold: 90 });
  if (changedRatio < 0.003 || changedRatio > 0.15) throw new Error('avatar_alignment');
  const first = removeFlatBackground(base, 40);
  const second = removeFlatBackground(edited, 40);
  let silhouetteChanges = 0;
  for (let i = 3; i < first.data.length; i += 4) {
    if (first.data[i]! >= 24 !== second.data[i]! >= 24) silhouetteChanges++;
  }
  if (silhouetteChanges / (base.width * base.height) > 0.015) throw new Error('avatar_alignment');
}
