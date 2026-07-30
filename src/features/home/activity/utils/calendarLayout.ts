import { homeActivityCalendar } from '@/config/constants';

import type { ActivityCalendarDay, ActivityData } from '../types';

export const activityCalendarRowCount = 7;

const weekMs = 7 * 24 * 60 * 60 * 1000;

export type ActivitySummary = {
  weekActiveDays: number;
  weekElapsedDays: number;
  yearActiveDays: number;
};

/**
 * Lays the dated range out as GitHub does: full Monday-start weeks covering the
 * first through last data day. Days outside the range render as blank spacers.
 */
export function buildActivityCalendarWeeks(data: ActivityData): ActivityCalendarDay[][] {
  const dateKeys = Object.keys(data).sort();
  if (dateKeys.length === 0) {
    return [];
  }

  const firstDataKey = dateKeys[0];
  const lastDataKey = dateKeys[dateKeys.length - 1];
  const calendarStart = startOfMondayWeek(parseLocalDateKey(firstDataKey));
  const lastWeekStart = startOfMondayWeek(parseLocalDateKey(lastDataKey));
  const weekCount = Math.round((lastWeekStart.getTime() - calendarStart.getTime()) / weekMs) + 1;

  return Array.from({ length: weekCount }, (_, weekIndex) =>
    Array.from({ length: activityCalendarRowCount }, (_, dayIndex) => {
      const dateKey = toLocalDateKey(addCalendarDays(calendarStart, weekIndex * 7 + dayIndex));

      return {
        dateKey,
        inRange: dateKey >= firstDataKey && dateKey <= lastDataKey,
      };
    }),
  );
}

export function getActivitySummary(data: ActivityData): ActivitySummary {
  const dateKeys = Object.keys(data).sort();
  if (dateKeys.length === 0) {
    return { weekActiveDays: 0, weekElapsedDays: 0, yearActiveDays: 0 };
  }

  const referenceDate = parseLocalDateKey(dateKeys[dateKeys.length - 1]);
  const referenceDateKey = toLocalDateKey(referenceDate);
  const yearStartKey = toLocalDateKey(new Date(referenceDate.getFullYear(), 0, 1, 12));
  const weekStartKey = toLocalDateKey(startOfMondayWeek(referenceDate));
  let weekActiveDays = 0;
  let yearActiveDays = 0;

  for (const [dateKey, level] of Object.entries(data)) {
    if (level === 0 || dateKey > referenceDateKey) {
      continue;
    }

    if (dateKey >= yearStartKey) {
      yearActiveDays += 1;
    }
    if (dateKey >= weekStartKey) {
      weekActiveDays += 1;
    }
  }

  return {
    weekActiveDays,
    weekElapsedDays: ((referenceDate.getDay() + 6) % 7) + 1,
    yearActiveDays,
  };
}

// Bottom-left to top-right wave: the first week's Sunday fires first.
export function getActivitySweepDelayMs(weekIndex: number, dayIndex: number): number {
  return homeActivityCalendar.sweepStepMs * (weekIndex + (activityCalendarRowCount - 1 - dayIndex));
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
