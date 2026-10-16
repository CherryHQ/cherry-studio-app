import {
  compareImages,
  opaqueBounds,
  removeFlatBackground,
  type RgbaImage,
  transplantChanges,
} from '../rgbaImage';

function canvas(size: number, fill: [number, number, number, number]): RgbaImage {
  const data = new Uint8Array(size * size * 4);
  for (let p = 0; p < size * size; p++) data.set(fill, p * 4);
  return { width: size, height: size, data };
}
function paint(image: RgbaImage, [x0, y0, x1, y1]: number[], rgba: number[]) {
  for (let y = y0!; y <= y1!; y++)
    for (let x = x0!; x <= x1!; x++) image.data.set(rgba, (y * image.width + x) * 4);
  return image;
}
const pixel = (image: RgbaImage, x: number, y: number) => [
  ...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4),
];

test('remove_background clears the border-connected flat colour but keeps similar colour inside', () => {
  const image = paint(canvas(40, [0, 255, 0, 255]), [10, 10, 29, 29], [200, 40, 40, 255]);
  paint(image, [18, 18, 21, 21], [0, 250, 0, 255]); // green detail enclosed by the subject
  const cut = removeFlatBackground(image, 40);
  expect(pixel(cut, 2, 2)[3]).toBe(0);
  expect(pixel(cut, 19, 19)[3]).toBe(255);
  expect(opaqueBounds(cut)).toEqual({ left: 10, top: 10, right: 29, bottom: 29 });
});

test('transplant carries only the changed area, feathered, and reports where it was', () => {
  const base = paint(canvas(64, [255, 255, 255, 255]), [20, 20, 43, 43], [250, 200, 180, 255]);
  const variant = paint(
    paint(canvas(64, [255, 255, 255, 255]), [20, 20, 43, 43], [250, 200, 180, 255]),
    [28, 30, 35, 33],
    [20, 20, 20, 255],
  );
  variant.data.set([0, 0, 255, 255], 0); // a redrawn detail outside the face region
  const result = transplantChanges(base, variant, {
    threshold: 90,
    region: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
  });
  expect(result.changedBounds).toEqual({ left: 28, top: 30, right: 35, bottom: 33 });
  // The feathered mask is all but opaque at the centre of the change.
  expect(
    pixel(result.image, 31, 31)
      .slice(0, 3)
      .every((v) => v <= 24),
  ).toBe(true);
  expect(pixel(result.image, 0, 0)).toEqual([255, 255, 255, 255]);
  expect(compareImages(base, variant, { threshold: 90 }).changedRatio).toBeGreaterThan(
    result.changedRatio,
  );
});
