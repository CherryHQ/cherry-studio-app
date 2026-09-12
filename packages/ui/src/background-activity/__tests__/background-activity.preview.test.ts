import { formatElapsedTime } from '../background-activity.preview';

describe('BackgroundActivityPreview', () => {
  test.each([
    [0, '0:00'],
    [7, '0:07'],
    [67, '1:07'],
    [3661, '1:01:01'],
    [-1, '0:00'],
  ])('formats %s seconds like the native compact timer', (seconds, expected) => {
    expect(formatElapsedTime(seconds)).toBe(expected);
  });
});
