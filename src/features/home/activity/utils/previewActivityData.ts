import { homeActivityCalendar } from '@/utils/constants';

import type { ActivityData, ActivityLevel } from '../types';
import { addCalendarDays, normalizeLocalDate, toLocalDateKey } from './calendarLayout';

// Random placeholder levels, matching the reference demo. Swap for real per-day
// usage aggregates once those exist.
export function createPreviewActivityData(endDate: Date, days: number): ActivityData {
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError('Preview activity days must be a positive integer');
  }

  const normalizedEndDate = normalizeLocalDate(endDate);
  const data: Record<string, ActivityLevel> = {};

  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
    const dateKey = toLocalDateKey(addCalendarDays(normalizedEndDate, -dayOffset));
    data[dateKey] = Math.floor(Math.random() * 5) as ActivityLevel;
  }

  return data;
}

// The reference sizes its data off the window: ~1 day per 3pt of 90% width.
export function getPreviewActivityDayCount(windowWidth: number): number {
  return Math.max(
    1,
    Math.floor(
      (windowWidth * homeActivityCalendar.previewWidthRatio) / homeActivityCalendar.previewDayWidth,
    ),
  );
}
