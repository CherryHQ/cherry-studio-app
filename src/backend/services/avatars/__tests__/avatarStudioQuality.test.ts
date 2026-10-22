import type { RgbaImage } from '@/backend/utils/rgbaImage';

import { validateAvatarBase, validateAvatarExpression } from '../avatarStudioQuality';

function picture(): RgbaImage {
  const data = new Uint8Array(100 * 100 * 4);
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++) {
      const i = (y * 100 + x) * 4;
      const subject = x >= 10 && x < 90 && y >= 10 && y < 90;
      data.set(subject ? [255, 128, 0, 255] : [0, 255, 0, 255], i);
    }
  return { data, width: 100, height: 100 };
}

test('accepts a framed character and localized face edit', () => {
  const base = picture();
  const edit = picture();
  for (let y = 40; y < 45; y++)
    for (let x = 40; x < 50; x++) edit.data.set([0, 0, 0, 255], (y * 100 + x) * 4);
  expect(() => validateAvatarBase(base)).not.toThrow();
  expect(() => validateAvatarExpression(base, edit)).not.toThrow();
});

test('rejects unchanged images, unrelated subjects and shifted silhouettes', () => {
  const base = picture();
  expect(() => validateAvatarExpression(base, picture())).toThrow('avatar_alignment');
  const unrelated = picture();
  for (let i = 0; i < unrelated.data.length; i += 4) unrelated.data[i] = 0;
  expect(() => validateAvatarExpression(base, unrelated)).toThrow('avatar_alignment');
  const shifted = picture();
  for (let y = 10; y < 90; y++)
    for (let x = 10; x < 13; x++) shifted.data.set([0, 255, 0, 255], (y * 100 + x) * 4);
  expect(() => validateAvatarExpression(base, shifted)).toThrow('avatar_alignment');
});

test('rejects empty artwork before presenting a candidate', () => {
  const image = picture();
  for (let i = 0; i < image.data.length; i += 4) image.data.set([0, 255, 0, 255], i);
  expect(() => validateAvatarBase(image)).toThrow('avatar_framing');
});
