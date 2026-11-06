import {
  HTML_CONVERSION_MAX_EDGE,
  HTML_CONVERSION_MAX_PAGES,
} from '@/shared/contracts/documentExport';

import { imageCapturePlan } from '../imageCapturePlan';
import {
  IMAGE_LAYOUT_WIDTH,
  IMAGE_PAGE_HEIGHT,
  IMAGE_PAGE_TOP_INSET,
  imagePagePlan,
  type ImagePageMeasurement,
} from '../imagePagePlan';

const measurement = (values: Partial<ImagePageMeasurement> = {}): ImagePageMeasurement => ({
  width: IMAGE_LAYOUT_WIDTH,
  height: IMAGE_PAGE_HEIGHT * 2 + 400,
  ink: [],
  ...values,
});

test('short content remains one image without padding the content to a full page', () => {
  expect(imagePagePlan(measurement({ height: 400 }), 'pages')).toEqual([{ top: 0, height: 400 }]);
});

test('long content becomes complete readable cards without a silent excerpt', () => {
  const pages = imagePagePlan(measurement({ height: 2500 }), 'pages');
  expect(pages).toHaveLength(6);
  expect(pages.every((page) => page.height <= IMAGE_PAGE_HEIGHT)).toBe(true);
  expect(pages.reduce((sum, page) => sum + page.height, 0)).toBe(2500);
});

test('fills every card before starting the next', () => {
  expect(imagePagePlan(measurement(), 'pages')).toEqual([
    { top: 0, height: IMAGE_PAGE_HEIGHT },
    { top: IMAGE_PAGE_HEIGHT, height: IMAGE_PAGE_HEIGHT },
    { top: IMAGE_PAGE_HEIGHT * 2, height: 400 },
  ]);
});

test('readable cards fit inside the native capture budget including top spacing', () => {
  const plan = imageCapturePlan(IMAGE_LAYOUT_WIDTH, IMAGE_PAGE_HEIGHT + IMAGE_PAGE_TOP_INSET);
  expect(plan.height).toBeLessThanOrEqual(HTML_CONVERSION_MAX_EDGE);
  expect(imagePagePlan(measurement({ height: IMAGE_PAGE_HEIGHT }), 'pages')).toEqual([
    { top: 0, height: IMAGE_PAGE_HEIGHT },
  ]);
  expect(imagePagePlan(measurement({ height: IMAGE_PAGE_HEIGHT + 1 }), 'pages')).toEqual([
    { top: 0, height: IMAGE_PAGE_HEIGHT },
    { top: IMAGE_PAGE_HEIGHT, height: 1 },
  ]);
});

test('long paragraphs break between text lines and never inside painted text', () => {
  const input = measurement({
    ink: [
      [IMAGE_PAGE_HEIGHT - 20, IMAGE_PAGE_HEIGHT + 8],
      [IMAGE_PAGE_HEIGHT * 2 - 20, IMAGE_PAGE_HEIGHT * 2 + 8],
    ],
  });
  const pages = imagePagePlan(input, 'pages');
  expect(pages).toEqual([
    { top: 0, height: IMAGE_PAGE_HEIGHT - 20 },
    { top: IMAGE_PAGE_HEIGHT - 20, height: IMAGE_PAGE_HEIGHT },
    { top: IMAGE_PAGE_HEIGHT * 2 - 20, height: 420 },
  ]);
  expect(pages.reduce((sum, page) => sum + page.height, 0)).toBe(input.height);
});

test('overlapping table-cell lines move a boundary above the complete painted band', () => {
  expect(
    imagePagePlan(
      measurement({
        ink: [
          [IMAGE_PAGE_HEIGHT - 20, IMAGE_PAGE_HEIGHT + 10],
          [IMAGE_PAGE_HEIGHT - 25, IMAGE_PAGE_HEIGHT - 10],
        ],
      }),
      'pages',
    )[0],
  ).toEqual({ top: 0, height: IMAGE_PAGE_HEIGHT - 25 });
});

test('moves a fitting image to the next page instead of cutting it', () => {
  expect(
    imagePagePlan(
      measurement({ ink: [[IMAGE_PAGE_HEIGHT - 200, IMAGE_PAGE_HEIGHT + 100]] }),
      'pages',
    )[0],
  ).toEqual({ top: 0, height: IMAGE_PAGE_HEIGHT - 200 });
});

test('rejects an oversized collection instead of returning only the first pages', () => {
  expect(() =>
    imagePagePlan(
      measurement({ height: IMAGE_PAGE_HEIGHT * HTML_CONVERSION_MAX_PAGES + 1 }),
      'pages',
    ),
  ).toThrow();
});

test('an object taller than a page fails instead of silently dropping or cutting its content', () => {
  expect(() =>
    imagePagePlan(measurement({ ink: [[0, IMAGE_PAGE_HEIGHT + 600]] }), 'pages'),
  ).toThrow();
});

test('single-image output preserves the complete height independently of capture tiles', () => {
  expect(imagePagePlan(measurement({ height: 150_000 }), 'single')).toEqual([
    { top: 0, height: 150_000 },
  ]);
});

test.each([NaN, Infinity, 0, -1])('rejects malformed measurement height %s', (height) => {
  expect(() => imagePagePlan(measurement({ height }), 'pages')).toThrow();
});
