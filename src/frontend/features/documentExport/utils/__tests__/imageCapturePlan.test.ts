import {
  DOCUMENT_EXPORT_IMAGE_MAX_HEIGHT,
  DOCUMENT_EXPORT_IMAGE_MAX_PIXELS,
  DOCUMENT_EXPORT_WEBP_MAX_DIMENSION,
} from '@/shared/contracts/documentExport';

import { imageCapturePlan } from '../imageCapturePlan';

const plan = (width: number, height: number) =>
  imageCapturePlan(
    width,
    height,
    DOCUMENT_EXPORT_IMAGE_MAX_HEIGHT,
    DOCUMENT_EXPORT_IMAGE_MAX_PIXELS,
  );

test('admits a conversation that exceeded the old 3x screen budget', () => {
  expect(402 * 4000 * 3 * 3).toBeGreaterThan(12_000_000);
  expect(plan(402, 4000)).toMatchObject({ width: 804, height: 8000, scale: 2 });
});

test('preserves at least 1x readability through the full logical height budget', () => {
  const result = plan(600, DOCUMENT_EXPORT_IMAGE_MAX_HEIGHT);
  expect(result).toMatchObject({ width: 600, height: 16_383, scale: 1 });
  expect(() => plan(600, DOCUMENT_EXPORT_IMAGE_MAX_HEIGHT + 1)).toThrow();
});

test.each([1, 1024, 1025, 4000, 8192, 12000, 16383])(
  'tiles %i points with no missing or overlapping pixels',
  (height) => {
    const result = plan(402, height);
    let offset = 0;
    for (const tile of result.tiles) {
      expect(tile.offset).toBe(offset);
      expect(tile.height).toBeGreaterThan(0);
      expect(tile.height).toBeLessThanOrEqual(1024);
      offset += tile.height;
    }
    expect(offset).toBe(result.height);
    expect(result.width * result.height).toBeLessThanOrEqual(DOCUMENT_EXPORT_IMAGE_MAX_PIXELS);
    expect(result.height).toBeLessThanOrEqual(DOCUMENT_EXPORT_WEBP_MAX_DIMENSION);
    expect(result.width / 402).toBe(result.scale);
  },
);

test('rounding stays within a smaller caller-provided pixel budget', () => {
  const result = imageCapturePlan(402, 1234, 16383, 999_999);
  expect(result.width * result.height).toBeLessThanOrEqual(999_999);
  expect(result.scale).toBeGreaterThanOrEqual(1);
});

test.each([NaN, Infinity, 0, -1])(
  'rejects invalid measured height %s before native allocation',
  (height) => {
    expect(() => plan(402, height)).toThrow();
  },
);
