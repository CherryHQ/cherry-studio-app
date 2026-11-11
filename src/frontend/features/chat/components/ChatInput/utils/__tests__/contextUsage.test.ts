import {
  deriveContextUsage,
  formatContextCapacity,
  formatContextUsagePercent,
} from '../contextUsage';

describe('context usage', () => {
  it('uses the last request measurement and declared capacity', () => {
    expect(deriveContextUsage(1000, { contextTokens: 796 })).toMatchObject({
      used: 796,
      ratio: 0.796,
      severity: 'primary',
    });
    expect(formatContextUsagePercent(0.796, 'en-US')).toBe('79%');
    expect(deriveContextUsage(1000, { contextTokens: 800 })?.severity).toBe('warning');
    expect(deriveContextUsage(1000, { contextTokens: 950 })?.severity).toBe('error');
    expect(deriveContextUsage(1000, { contextTokens: 1100 })).toMatchObject({
      used: 1100,
      arcRatio: 1,
    });
  });
  it('does not present invalid capacities or measurements', () => {
    expect(deriveContextUsage(0)).toBeUndefined();
    expect(deriveContextUsage(Infinity)).toBeUndefined();
    expect(deriveContextUsage(100, { contextTokens: 0 })?.used).toBeUndefined();
    expect(deriveContextUsage(100, { contextTokens: NaN })?.used).toBeUndefined();
  });
  it('keeps capacities in thousands with language-aware decimals', () => {
    expect(formatContextCapacity(200_000, 'en-US')).toBe('200');
    expect(formatContextCapacity(8_192, 'en-US')).toBe('8.2');
    expect(formatContextCapacity(8_192, 'de-DE')).toBe('8,2');
    expect(formatContextCapacity(1_000_000, 'en-US')).toBe('1,000');
  });
});
