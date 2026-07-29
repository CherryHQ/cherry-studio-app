import {
  MAX_QUERY_RANGE_DAYS,
  normalizeOptionalDateRange,
  parseDateRange,
  parseIsoDate,
  withNativeToolTimeout,
} from '../toolUtils';

describe('built-in tool date ranges', () => {
  test('accepts an exact 90-day range', () => {
    const range = parseDateRange('2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z');

    expect(range.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(MAX_QUERY_RANGE_DAYS).toBe(90);
  });

  test('rejects ranges longer than 90 days', () => {
    expect(() => parseDateRange('2026-01-01T00:00:00Z', '2026-04-01T00:00:00.001Z')).toThrow(
      'cannot exceed 90 days',
    );
  });

  test('rejects reversed and empty ranges', () => {
    expect(() => parseDateRange('2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z')).toThrow(
      'must be after',
    );
    expect(() => parseDateRange('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).toThrow(
      'must be after',
    );
  });

  test('rejects invalid dates and defaults an omitted start to seven days', () => {
    expect(() => parseIsoDate('not-a-date', 'startDate')).toThrow('valid ISO 8601');

    const range = normalizeOptionalDateRange(undefined, '2026-02-08T00:00:00Z');
    expect(range.start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('withNativeToolTimeout', () => {
  test('returns a native result before the deadline', async () => {
    await expect(withNativeToolTimeout(Promise.resolve('ok'), 'Native call', 100)).resolves.toBe(
      'ok',
    );
  });

  test('rejects a stalled native call with its operation label', async () => {
    jest.useFakeTimers();
    const result = withNativeToolTimeout(new Promise<never>(() => undefined), 'Native call', 50);

    jest.advanceTimersByTime(50);

    await expect(result).rejects.toThrow('Native call timed out');
    jest.useRealTimers();
  });
});
