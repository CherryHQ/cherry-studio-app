import { aiUsageCalendar } from '@/frontend/utils/constants';

import type { AiUsageCalendarDay, AiUsageData } from '../types';

export const AI_USAGE_CALENDAR_ROW_COUNT = 7;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Lays the dated range out as GitHub does: full Monday-start weeks covering the
 * first through last data day. Days outside the range render as blank spacers.
 */
export function buildAiUsageCalendarWeeks(data: AiUsageData): AiUsageCalendarDay[][] {
  const dateKeys = Object.keys(data).sort();
  if (dateKeys.length === 0) {
    return [];
  }

  const firstDataKey = dateKeys[0];
  const lastDataKey = dateKeys[dateKeys.length - 1];
  const calendarStart = startOfMondayWeek(parseLocalDateKey(firstDataKey));
  const lastWeekStart = startOfMondayWeek(parseLocalDateKey(lastDataKey));
  const weekCount = Math.round((lastWeekStart.getTime() - calendarStart.getTime()) / WEEK_MS) + 1;

  return Array.from({ length: weekCount }, (_, weekIndex) =>
    Array.from({ length: AI_USAGE_CALENDAR_ROW_COUNT }, (_, dayIndex) => {
      const dateKey = toLocalDateKey(addCalendarDays(calendarStart, weekIndex * 7 + dayIndex));

      return {
        dateKey,
        inRange: dateKey >= firstDataKey && dateKey <= lastDataKey,
      };
    }),
  );
}

// Bottom-left to top-right wave: the first week's Sunday fires first.
export function getAiUsageSweepDelayMs(weekIndex: number, dayIndex: number): number {
  return aiUsageCalendar.sweepStepMs * (weekIndex + (AI_USAGE_CALENDAR_ROW_COUNT - 1 - dayIndex));
}

export function getAiUsageMonthLabelKeys(weeks: AiUsageCalendarDay[][]): (string | undefined)[] {
  let previousMonth = '';
  let previousLabelIndex = -Infinity;

  return weeks.map((week, weekIndex) => {
    const firstDayInNewMonth = week.find(
      (day) => day.inRange && day.dateKey.slice(0, 7) !== previousMonth,
    );
    if (!firstDayInNewMonth) {
      return undefined;
    }

    previousMonth = firstDayInNewMonth.dateKey.slice(0, 7);
    if (weekIndex - previousLabelIndex < 3) {
      return undefined;
    }

    previousLabelIndex = weekIndex;
    return firstDayInNewMonth.dateKey;
  });
}

export function addCalendarDays(date: Date, days: number): Date {
  const result = normalizeLocalDate(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Noon keeps date arithmetic stable across DST transitions.
export function normalizeLocalDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

export function parseLocalDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function startOfMondayWeek(date: Date): Date {
  const normalizedDate = normalizeLocalDate(date);
  const daysSinceMonday = (normalizedDate.getDay() + 6) % 7;
  return addCalendarDays(normalizedDate, -daysSinceMonday);
}

export function toLocalDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
