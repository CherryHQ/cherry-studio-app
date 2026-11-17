import {
  deriveContextUsage,
  formatContextCapacity,
  formatContextUsagePercent,
} from '../contextUsage';

describe('context usage', () => {
  it('uses the current retained context and declared capacity', () => {
    expect(deriveContextUsage(1000, 796)).toMatchObject({
      used: 796,
      ratio: 0.796,
      severity: 'primary',
    });
    expect(formatContextUsagePercent(0.796, 'en-US')).toBe('80%');
    expect(deriveContextUsage(1000, 800)?.severity).toBe('warning');
    expect(deriveContextUsage(1000, 950)?.severity).toBe('error');
    expect(deriveContextUsage(1000, 1100)).toMatchObject({
      used: 1100,
      arcRatio: 1,
    });
  });
  it('does not present invalid capacities or measurements', () => {
    expect(deriveContextUsage(0)).toBeUndefined();
    expect(deriveContextUsage(Infinity)).toBeUndefined();
    expect(deriveContextUsage(100, -1)?.used).toBeUndefined();
    expect(deriveContextUsage(100, NaN)?.used).toBeUndefined();
  });
  it('shows an empty retained context as zero rather than unknown', () => {
    expect(deriveContextUsage(100, 0)).toMatchObject({ used: 0, ratio: 0, arcRatio: 0 });
  });
  it('marks reconstructed occupancy as an estimate', () => {
    expect(deriveContextUsage(1000, 120, true)?.estimated).toBe(true);
    expect(formatContextUsagePercent(0.12, 'en-US', true)).toBe('≈12%');
  });
  it('limits percentages to whole numbers without truncating floating-point errors', () => {
    expect(formatContextUsagePercent(58_000 / 200_000, 'en-US')).toBe('29%');
    expect(formatContextUsagePercent(116_000 / 200_000, 'en-US')).toBe('58%');
    expect(formatContextUsagePercent(0.123456789, 'en-US')).toBe('12%');
  });
  it('keeps capacities in thousands with language-aware decimals', () => {
    expect(formatContextCapacity(200_000, 'en-US')).toBe('200');
    expect(formatContextCapacity(8_192, 'en-US')).toBe('8.2');
    expect(formatContextCapacity(8_192, 'de-DE')).toBe('8,2');
    expect(formatContextCapacity(1_000_000, 'en-US')).toBe('1,000');
  });
});
