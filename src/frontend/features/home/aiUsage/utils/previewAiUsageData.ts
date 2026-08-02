import { homeAiUsageCalendar } from '@/frontend/utils/constants';

import type { AiUsageData, AiUsageLevel } from '../types';
import { addCalendarDays, normalizeLocalDate, toLocalDateKey } from './aiUsageCalendar';

// Random placeholder levels, matching the reference demo. Swap for real per-day
// usage aggregates once those exist.
export function createPreviewAiUsageData(endDate: Date, days: number): AiUsageData {
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError('Preview activity days must be a positive integer');
  }

  const normalizedEndDate = normalizeLocalDate(endDate);
  const data: Record<string, AiUsageLevel> = {};

  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
    const dateKey = toLocalDateKey(addCalendarDays(normalizedEndDate, -dayOffset));
    data[dateKey] = Math.floor(Math.random() * 5) as AiUsageLevel;
  }

  return data;
}

// The reference sizes its data off the window: ~1 day per 3pt of 90% width.
export function getPreviewAiUsageDayCount(windowWidth: number): number {
  return Math.max(
    1,
    Math.floor(
      (windowWidth * homeAiUsageCalendar.previewWidthRatio) / homeAiUsageCalendar.previewDayWidth,
    ),
  );
}
