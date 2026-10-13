import { formatCompactNumber } from '../compactNumber';

describe('formatCompactNumber', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1K'],
    [2740, '2.7K'],
    [27_000, '27K'],
    [975_732, '975.7K'],
    [999_950, '1M'],
    [3_801_009, '3.8M'],
    [1_250_000_000, '1.3B'],
  ])('formats %d as %s', (value, text) => {
    expect(formatCompactNumber(value)).toBe(text);
  });
});
