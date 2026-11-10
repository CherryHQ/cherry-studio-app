import { imageCapturePlan, imageCaptureTiles } from '../imageCapturePlan';

test('long share cards retain fixed 3x density for the complete output and every tile without seams', () => {
  const scale = 3;
  const viewport = { width: 320, height: 480 };
  const tiles = imageCaptureTiles(360, 3600, viewport, 3, scale);
  const output = imageCapturePlan(360, 3600, scale);
  expect(output).toMatchObject({ width: 1080, height: 10800, scale: 3 });
  expect(
    tiles.reduce(
      (sum, tile) =>
        sum +
        imageCapturePlan(tile.width, tile.height, scale).width *
          imageCapturePlan(tile.width, tile.height, scale).height,
      0,
    ),
  ).toBe(output.width * output.height);
  expect(
    tiles.every(
      (tile) =>
        tile.width * scale < viewport.width * 3 && tile.height * scale < viewport.height * 3,
    ),
  ).toBe(true);
});

test('keeps fixed 3x output density beyond the former WebP dimension and pixel limits', () => {
  const result = imageCapturePlan(800, 20000);
  expect(result).toEqual({ width: 2400, height: 60000, scale: 3, layoutHeight: 20000 });
  expect(result.width * result.height).toBeGreaterThan(24_000_000);
});

test.each([NaN, Infinity, 0, -1, Number.MAX_VALUE])(
  'rejects invalid dimensions %s before native allocation',
  (value) => {
    expect(() => imageCapturePlan(402, value)).toThrow();
    expect(() => imageCapturePlan(value, 402)).toThrow();
  },
);

test.each([1, 2, 2.625, 3])(
  'tiles fit both viewport dimensions at device density %s without losing pixels',
  (density) => {
    const viewport = { width: 320, height: 480 };
    const width = 360;
    const height = 2437;
    const tiles = imageCaptureTiles(width, height, viewport, density);
    let rowTop = 0;
    let rowHeight = 0;
    let nextLeft = 0;
    for (const tile of tiles) {
      if (tile.top !== rowTop) {
        expect(nextLeft).toBe(width);
        expect(tile.top).toBe(rowTop + rowHeight);
        rowTop = tile.top;
        nextLeft = 0;
      }
      expect(tile.left).toBe(nextLeft);
      const plan = imageCapturePlan(tile.width, tile.height);
      expect(plan.width / density).toBeLessThan(viewport.width);
      expect(plan.height / density).toBeLessThan(viewport.height);
      nextLeft += tile.width;
      rowHeight = tile.height;
    }
    expect(nextLeft).toBe(width);
    expect(rowTop + rowHeight).toBe(height);
    expect(tiles.reduce((pixels, tile) => pixels + tile.width * tile.height * 9, 0)).toBe(
      width * height * 9,
    );
  },
);

test.each([0, -1, NaN, Infinity])('rejects an unusable viewport or density %s', (value) => {
  expect(() => imageCaptureTiles(360, 1000, { width: 320, height: value }, 3)).toThrow();
  expect(() => imageCaptureTiles(360, 1000, { width: value, height: 480 }, 3)).toThrow();
  expect(() => imageCaptureTiles(360, 1000, { width: 320, height: 480 }, value)).toThrow();
});
