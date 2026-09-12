import { createAiUsageTokenFormatter } from '../formatAiUsageTokens';

describe('AI usage token formatting', () => {
  test.each([
    [0, '0'],
    [999, '999'],
    [1_000, '1K'],
    [1_187, '1.2K'],
    [280_000, '280K'],
    [1_187_000, '1.2M'],
    [2_000_000, '2M'],
  ])('formats %d as a stable compact value', (value, expected) => {
    expect(createAiUsageTokenFormatter('zh-CN')(value)).toBe(expected);
  });

  test('normalizes invalid and negative values', () => {
    const format = createAiUsageTokenFormatter('en-US');

    expect(format(Number.NaN)).toBe('0');
    expect(format(-100)).toBe('0');
  });
});
