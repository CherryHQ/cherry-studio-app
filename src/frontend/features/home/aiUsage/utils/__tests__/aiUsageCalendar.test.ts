import { homeAiUsageCalendar } from '@/frontend/utils/constants';

import {
  buildAiUsageCalendarWeeks,
  getAiUsageSummary,
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
    expect(getAiUsageSweepDelayMs(1, 0)).toBe(homeAiUsageCalendar.sweepStepMs * 7);
  });

  test('summarizes lit days for the current year and Monday-start week', () => {
    expect(
      getAiUsageSummary({
        '2025-12-31': 4,
        '2026-01-01': 1,
        '2026-07-19': 3,
        '2026-07-20': 2,
        '2026-07-21': 0,
        '2026-07-22': 4,
      }),
    ).toEqual({
      weekActiveDays: 2,
      weekElapsedDays: 3,
      yearActiveDays: 4,
    });
  });

  test('returns zero counts for empty AI usage data', () => {
    expect(getAiUsageSummary({})).toEqual({
      weekActiveDays: 0,
      weekElapsedDays: 0,
      yearActiveDays: 0,
    });
  });
});
