import {
  fitCrop,
  FULL_IMAGE_CROP,
  INITIAL_IMAGE_EDIT,
  mirrorImageEdit,
  moveCrop,
  rotateImageEdit,
} from '../crop-geometry';
import type { ImageEdit } from '../image-editor.types';

test('rotates the selected pixels clockwise, and restores them after four quarter turns', () => {
  const source: ImageEdit = {
    ...INITIAL_IMAGE_EDIT,
    crop: { x: 0.1, y: 0.2, width: 0.3, height: 0.5 },
  };
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

test('quarter turns preserve the axes of perspective and mirroring', () => {
  const source = { ...INITIAL_IMAGE_EDIT, horizontal: 12, vertical: -9, flipHorizontal: true };
  const rotated = rotateImageEdit(source);
  expect(rotated).toMatchObject({
    horizontal: 9,
    vertical: 12,
    flipHorizontal: false,
    flipVertical: true,
  });
  expect(rotateImageEdit(rotateImageEdit(rotateImageEdit(rotated)))).toEqual(source);
});

test('mirroring carries the selection and perspective along, and twice restores the source', () => {
  const source = {
    ...INITIAL_IMAGE_EDIT,
    horizontal: 12,
    crop: { x: 0.1, y: 0.2, width: 0.3, height: 0.5 },
  };
  const mirrored = mirrorImageEdit(source, 'horizontal');
  expect(mirrored.crop.x).toBeCloseTo(0.6);
  expect(mirrored.horizontal).toBe(-12);
  expect(mirrored.flipHorizontal).toBe(true);
  const restored = mirrorImageEdit(mirrored, 'horizontal');
  expect(restored.crop.x).toBeCloseTo(source.crop.x);
  expect(restored.horizontal).toBe(source.horizontal);
  expect(restored.flipHorizontal).toBe(false);
});

test.each([
  'left',
  'right',
  'top',
  'bottom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const)('locked ratio survives %s adjustments inside safe bounds', (handle) => {
  const bounds = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
  const crop = fitCrop(bounds, bounds, 1.5);
  for (const delta of [-2, -0.1, 0.1, 2]) {
    const next = moveCrop(crop, handle, delta, -delta, 0.05, 0.05, bounds, 1.5);
    expect(next.width / next.height).toBeCloseTo(1.5);
    expect(next.x).toBeGreaterThanOrEqual(bounds.x - 1e-10);
    expect(next.y).toBeGreaterThanOrEqual(bounds.y - 1e-10);
    expect(next.x + next.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1e-10);
    expect(next.y + next.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1e-10);
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
