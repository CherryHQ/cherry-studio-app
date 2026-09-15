import { imageCapturePlan } from '../imageCapturePlan';

test('keeps fixed 2x clarity beyond the former WebP dimension and pixel limits', () => {
  const result = imageCapturePlan(800, 20000);
  expect(result).toEqual({ width: 1600, height: 40000, scale: 2, layoutHeight: 20000 });
  expect(result.width * result.height).toBeGreaterThan(24_000_000);
});

test.each([NaN, Infinity, 0, -1, Number.MAX_VALUE])(
  'rejects invalid dimensions %s before native allocation',
  (value) => {
    expect(() => imageCapturePlan(402, value)).toThrow();
    expect(() => imageCapturePlan(value, 402)).toThrow();
  },
);
