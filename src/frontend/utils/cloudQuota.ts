import type { TFunction } from 'i18next';

import type { CloudQuotaWindow } from '@/shared/contracts/cloud';

export function formatQuotaWindow(window: CloudQuotaWindow, language: string, t: TFunction) {
  if (window.window_type === 'subscription_month') return t('cloud.subscriptionMonth');
  if (window.window_type === 'calendar_day') return t('cloud.calendarDay');
  if (window.duration_seconds === 7 * 86400) return t('cloud.weeklyQuota');
  if (window.duration_seconds % 86400 === 0) {
    const days = window.duration_seconds / 86400;
    return t('cloud.rollingDays', {
      count: days,
      days: new Intl.NumberFormat(language).format(days),
    });
  }
  const hours = window.duration_seconds / 3600;
  return t('cloud.rollingHours', {
    count: hours,
    hours: new Intl.NumberFormat(language).format(hours),
  });
}

/** Short period labels leave room for the remaining percentage in compact app chrome. */
export function formatQuotaWindowShort(window: CloudQuotaWindow, language: string, t: TFunction) {
  if (window.window_type === 'subscription_month') return t('cloud.quotaMonthShort');
  if (window.window_type === 'calendar_day') return t('cloud.quotaDayShort');
  if (window.duration_seconds === 7 * 86400) return t('cloud.quotaWeekShort');
  if (window.duration_seconds % 86400 === 0) {
    return t('cloud.quotaDaysShort', {
      days: new Intl.NumberFormat(language).format(window.duration_seconds / 86400),
    });
  }
  return t('cloud.quotaHoursShort', {
    hours: new Intl.NumberFormat(language).format(window.duration_seconds / 3600),
  });
}
