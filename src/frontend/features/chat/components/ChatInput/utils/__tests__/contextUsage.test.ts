import { deriveContextUsage, formatContextUsagePercent, getCacheHitRate } from '../contextUsage';

describe('context usage', () => {
  it('uses the last request measurement and declared capacity', () => {
    expect(deriveContextUsage(1000, { contextTokens: 796, inputTokens: 1200 })).toMatchObject({
      used: 796,
      remaining: 204,
      ratio: 0.796,
      severity: 'primary',
    });
    expect(formatContextUsagePercent(0.796, 'en-US')).toBe('79%');
    expect(deriveContextUsage(1000, { contextTokens: 800 })?.severity).toBe('warning');
    expect(deriveContextUsage(1000, { contextTokens: 950 })?.severity).toBe('error');
    expect(deriveContextUsage(1000, { contextTokens: 1100 })).toMatchObject({
      used: 1100,
      remaining: 0,
      arcRatio: 1,
    });
  });
  it('does not present invalid capacities or measurements', () => {
    expect(deriveContextUsage(0)).toBeUndefined();
    expect(deriveContextUsage(Infinity)).toBeUndefined();
    expect(deriveContextUsage(100, { contextTokens: 0 })?.used).toBeUndefined();
    expect(deriveContextUsage(100, { contextTokens: NaN })?.used).toBeUndefined();
  });
  it('validates attributed cache buckets without reconstructing input', () => {
    expect(getCacheHitRate(100, { cacheReadTokens: 0 })).toBe(0);
    expect(getCacheHitRate(100, { cacheReadTokens: 30, cacheWriteTokens: 20 })).toBe(0.3);
    expect(getCacheHitRate(undefined, { cacheReadTokens: 30 })).toBeUndefined();
    expect(getCacheHitRate(100, { cacheReadTokens: 101 })).toBeUndefined();
    expect(getCacheHitRate(100, { cacheReadTokens: 30, cacheWriteTokens: -1 })).toBeUndefined();
    expect(
      getCacheHitRate(100, { noCacheTokens: 50, cacheReadTokens: 30, cacheWriteTokens: 10 }),
    ).toBeUndefined();
    expect(
      getCacheHitRate(100, { noCacheTokens: 60, cacheReadTokens: 30, cacheWriteTokens: 10 }),
    ).toBe(0.3);
  });
});
