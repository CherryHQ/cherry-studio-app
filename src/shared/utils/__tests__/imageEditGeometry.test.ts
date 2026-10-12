import { imageEditGeometry, mapImagePoint } from '../imageEditGeometry';

const source = { width: 1200, height: 800 };
const initial = { rotation: 0 as const, crop: { x: 0, y: 0, width: 1, height: 1 } };

test('identity and quarter turns have exact dimensions and preserve all pixels', () => {
  expect(imageEditGeometry(initial, source)).toMatchObject({
    width: 1200,
    height: 800,
    matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    bounds: initial.crop,
  });
  const quarter = imageEditGeometry({ ...initial, rotation: 90 }, source);
  expect(quarter).toMatchObject({ width: 800, height: 1200, bounds: initial.crop });
  expect(mapImagePoint(quarter.matrix, { x: 0, y: 0 })).toEqual({ x: 800, y: 0 });
  expect(mapImagePoint(quarter.matrix, { x: 1200, y: 800 })).toEqual({ x: 0, y: 1200 });
});

test('horizontal perspective changes opposite-edge scale, while vertical perspective changes the other axis', () => {
  const horizontal = imageEditGeometry({ ...initial, horizontal: 30 }, source);
  const points = [
    { x: 0, y: 0 },
    { x: 1200, y: 0 },
    { x: 1200, y: 800 },
    { x: 0, y: 800 },
  ].map((point) => mapImagePoint(horizontal.matrix, point));
  expect(points[3].y - points[0].y).toBeGreaterThan(points[2].y - points[1].y);
  const vertical = imageEditGeometry({ ...initial, vertical: 30 }, source);
  const topLeft = mapImagePoint(vertical.matrix, { x: 0, y: 0 });
  const topRight = mapImagePoint(vertical.matrix, { x: 1200, y: 0 });
  const bottomLeft = mapImagePoint(vertical.matrix, { x: 0, y: 800 });
  const bottomRight = mapImagePoint(vertical.matrix, { x: 1200, y: 800 });
  expect(topRight.x - topLeft.x).toBeGreaterThan(bottomRight.x - bottomLeft.x);
});

test('mirrors swap the requested source corners without changing frame dimensions', () => {
  const mirrored = imageEditGeometry(
    { ...initial, flipHorizontal: true, flipVertical: true },
    source,
  );
  expect(mapImagePoint(mirrored.matrix, { x: 0, y: 0 })).toEqual({ x: 1200, y: 800 });
  expect(mapImagePoint(mirrored.matrix, { x: 1200, y: 800 })).toEqual({ x: 0, y: 0 });
});

test.each([0, 90, 180, 270] as const)(
  'safe crop remains inside the source polygon at every adjustment limit after %s°',
  (rotation) => {
    for (const straighten of [-45, 0, 45])
      for (const horizontal of [-45, 0, 45])
        for (const vertical of [-45, 0, 45]) {
          const result = imageEditGeometry(
            { ...initial, rotation, straighten, horizontal, vertical },
            source,
          );
          const corners = [
            { x: 0, y: 0 },
            { x: 1200, y: 0 },
            { x: 1200, y: 800 },
            { x: 0, y: 800 },
          ].map((point) => mapImagePoint(result.matrix, point));
          const { x, y, width, height } = result.bounds;
          expect([x, y, width, height, ...result.matrix].every(Number.isFinite)).toBe(true);
          expect(width).toBeGreaterThan(0);
          expect(height).toBeGreaterThan(0);
          for (const point of [
            { x, y },
            { x: x + width, y },
            { x: x + width, y: y + height },
            { x, y: y + height },
          ]) {
            for (let index = 0; index < 4; index++) {
              const a = corners[index],
                b = corners[(index + 1) % 4];
              const cross =
                (b.x - a.x) * (point.y * result.height - a.y) -
                (b.y - a.y) * (point.x * result.width - a.x);
              expect(cross).toBeGreaterThanOrEqual(-1e-5);
            }
          }
        }
  },
);
