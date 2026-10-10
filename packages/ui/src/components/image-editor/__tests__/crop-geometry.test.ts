import { FULL_IMAGE_CROP, moveCrop, rotateImageEdit } from '../crop-geometry';
import type { ImageEdit } from '../image-editor.types';

test('rotates the selected pixels clockwise, and restores them after four quarter turns', () => {
  const source: ImageEdit = { rotation: 0, crop: { x: 0.1, y: 0.2, width: 0.3, height: 0.5 } };
  const rotated = rotateImageEdit(source);
  expect(rotated.rotation).toBe(90);
  expect(rotated.crop.x).toBeCloseTo(0.3);
  expect(rotated.crop.y).toBeCloseTo(0.1);
  expect(rotated.crop.width).toBeCloseTo(0.5);
  expect(rotated.crop.height).toBeCloseTo(0.3);
  const restored = rotateImageEdit(rotateImageEdit(rotateImageEdit(rotated)));
  expect(restored.rotation).toBe(0);
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(restored.crop[key]).toBeCloseTo(source.crop[key]);
  }
});

test('moving a selection clamps its origin without changing its size', () => {
  const crop = { x: 0.2, y: 0.3, width: 0.4, height: 0.5 };
  expect(moveCrop(crop, 'move', 4, -4, 0.1, 0.1)).toEqual({
    x: 0.6,
    y: 0,
    width: 0.4,
    height: 0.5,
  });
});

test('a corner cannot cross its opposite edge or escape the source', () => {
  const cropped = moveCrop(FULL_IMAGE_CROP, 'top-left', 5, 5, 0.1, 0.2);
  expect(cropped.x).toBeCloseTo(0.9);
  expect(cropped.y).toBeCloseTo(0.8);
  expect(cropped.width).toBeCloseTo(0.1);
  expect(cropped.height).toBeCloseTo(0.2);
  expect(moveCrop(FULL_IMAGE_CROP, 'bottom-right', 10, 10, 0.1, 0.1)).toEqual(FULL_IMAGE_CROP);
});
