import { imagePagePlan, type ImagePageMeasurement } from '../imagePagePlan';

const measurement = (values: Partial<ImagePageMeasurement> = {}): ImagePageMeasurement => ({
  width: 360,
  height: 2800,
  sections: [],
  blocks: [],
  ink: [],
  ...values,
});

test('short content remains one image without padding the content to a full page', () => {
  expect(imagePagePlan(measurement({ height: 400 }), 'pages')).toEqual([{ top: 0, height: 400 }]);
});

test('prefers message boundaries, then paragraph boundaries, without losing any content', () => {
  expect(imagePagePlan(measurement({ sections: [1000], blocks: [1100, 2100] }), 'pages')).toEqual([
    { top: 0, height: 1000 },
    { top: 1000, height: 1100 },
    { top: 2100, height: 700 },
  ]);
});

test('long paragraphs break between text lines and never inside painted text', () => {
  const input = measurement({
    ink: [
      [1180, 1208],
      [2380, 2408],
    ],
  });
  const pages = imagePagePlan(input, 'pages');
  expect(pages).toEqual([
    { top: 0, height: 1180 },
    { top: 1180, height: 1200 },
    { top: 2380, height: 420 },
  ]);
  expect(pages.reduce((sum, page) => sum + page.height, 0)).toBe(input.height);
});

test('overlapping table-cell lines move a boundary above the complete painted band', () => {
  expect(
    imagePagePlan(
      measurement({
        ink: [
          [1180, 1210],
          [1175, 1190],
        ],
        blocks: [1190],
      }),
      'pages',
    )[0],
  ).toEqual({ top: 0, height: 1175 });
});

test('moves a fitting image to the next page instead of cutting it', () => {
  expect(imagePagePlan(measurement({ ink: [[700, 1400]] }), 'pages')[0]).toEqual({
    top: 0,
    height: 700,
  });
});

test('an object taller than a page fails instead of silently dropping or cutting its content', () => {
  expect(() => imagePagePlan(measurement({ ink: [[0, 1800]] }), 'pages')).toThrow();
});

test('single-image mode preserves the complete height without a page-height restriction', () => {
  expect(imagePagePlan(measurement({ height: 150_000 }), 'single')).toEqual([
    { top: 0, height: 150_000 },
  ]);
});

test.each([NaN, Infinity, 0, -1])('rejects malformed measurement height %s', (height) => {
  expect(() => imagePagePlan(measurement({ height }), 'pages')).toThrow();
});
