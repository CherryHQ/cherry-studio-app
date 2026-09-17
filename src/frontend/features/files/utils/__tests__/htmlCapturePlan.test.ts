import { parseHtmlCapturePages } from '../htmlCapturePlan';

const page = { x: 0, y: 0, width: 1280, height: 720 };

test('accepts ordered page crops without retaining extra WebView message fields', () => {
  expect(
    parseHtmlCapturePages([
      { ...page, uri: 'untrusted' },
      { ...page, y: 720 },
    ]),
  ).toEqual([page, { ...page, y: 720 }]);
});

test.each(
  [
    null,
    [],
    [{}],
    [{ ...page, width: Infinity }],
    [{ ...page, height: 0 }],
    [{ ...page, y: -1 }],
    [{ ...page, width: 8193 }],
    [{ ...page, width: 5000, height: 5000 }],
    [{ ...page, width: 1.5 }],
    Array.from({ length: 65 }, () => page),
  ].map((value) => ({ value })),
)('rejects invalid or excessive native allocation requests: %j', ({ value }) => {
  expect(() => parseHtmlCapturePages(value)).toThrow();
});
