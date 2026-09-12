import { aiUsageCalendar } from '@/frontend/utils/constants';

import {
  buildAiUsageCalendarWeeks,
  getAiUsageMonthLabelKeys,
  getAiUsageSweepDelayMs,
  startOfMondayWeek,
  toLocalDateKey,
} from '../aiUsageCalendar';

describe('AI usage calendar layout', () => {
  test('starts weeks on Monday', () => {
    expect(toLocalDateKey(startOfMondayWeek(new Date(2026, 6, 19)))).toBe('2026-07-13');
  });

  test('returns no weeks for empty data', () => {
    expect(buildAiUsageCalendarWeeks({})).toEqual([]);
  });

  test('pads the data range out to full weeks with out-of-range spacers', () => {
    const weeks = buildAiUsageCalendarWeeks({ '2025-12-31': 2, '2026-01-01': 4 });

    expect(weeks).toHaveLength(1);
    expect(weeks[0].map((day) => day.dateKey)).toEqual([
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ]);
    expect(weeks[0].map((day) => day.inRange)).toEqual([
      false,
      false,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  test('spans month and year boundaries', () => {
    const weeks = buildAiUsageCalendarWeeks({ '2025-12-22': 1, '2026-01-04': 3 });

    expect(weeks).toHaveLength(2);
    expect(weeks[0][0].dateKey).toBe('2025-12-22');
    expect(weeks[1][6].dateKey).toBe('2026-01-04');
    expect(weeks.flat().every((day) => day.inRange)).toBe(true);
  });

  test('sweeps from the bottom-left toward the top-right by diagonal', () => {
    expect(getAiUsageSweepDelayMs(0, 6)).toBe(0);
    expect(getAiUsageSweepDelayMs(0, 5)).toBe(getAiUsageSweepDelayMs(1, 6));
    expect(getAiUsageSweepDelayMs(1, 0)).toBe(aiUsageCalendar.sweepStepMs * 7);
  });

  test('labels month changes without crowding adjacent weeks', () => {
    const weeks = buildAiUsageCalendarWeeks({
      '2026-01-26': 1,
      '2026-03-08': 1,
    });

    expect(getAiUsageMonthLabelKeys(weeks)).toEqual([
      '2026-01-26',
      undefined,
      undefined,
      undefined,
      '2026-03-01',
      undefined,
    ]);
  });

  test('labels a new month when it starts in the middle of a week', () => {
    const weeks = buildAiUsageCalendarWeeks({
      '2026-07-04': 1,
      '2026-08-02': 1,
    });

    expect(getAiUsageMonthLabelKeys(weeks)).toEqual([
      '2026-07-04',
      undefined,
      undefined,
      undefined,
      '2026-08-01',
    ]);
  });
});
