import type { TFunction } from 'i18next';

import type { CloudPlans, CloudQuotaPool, CloudQuotaWindow } from '@/shared/contracts/cloud';

export const SUBSCRIPTION_STATE_KEYS = {
  active: 'cloud.active',
  upcoming: 'cloud.upcoming',
  expired: 'cloud.expired',
  disabled: 'cloud.disabled',
} as const;

const INTERVAL_KEYS = {
  day: 'cloud.perDay',
  week: 'cloud.perWeek',
  month: 'cloud.perMonth',
  year: 'cloud.perYear',
} as const;

export function formatSubscriptionDate(
  value: string | undefined,
  language: string,
  precise = false,
) {
  if (!value) return '—';
  const date = new Date(value);
  return precise
    ? date.toLocaleString(language)
    : date.toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatSubscriptionPrice(
  plan: CloudPlans['entitlements'][number]['plan'],
  language: string,
  t: TFunction,
) {
  const price = plan.subscription_price;
  if (!price) return plan.is_free ? t('cloud.free') : '—';
  const amount = new Intl.NumberFormat(language, {
    style: 'currency',
    currency: price.currency,
  }).format(price.unit_amount / 100);
  const interval = Object.hasOwn(INTERVAL_KEYS, price.interval)
    ? t(INTERVAL_KEYS[price.interval as keyof typeof INTERVAL_KEYS])
    : '';
  return interval ? t('cloud.pricePerInterval', { amount, interval }) : amount;
}

export function formatQuotaQuantity(
  units: number,
  pool: CloudQuotaPool,
  language: string,
  t: TFunction,
) {
  return pool.measurement_kind === 'money' && pool.currency
    ? new Intl.NumberFormat(language, {
        style: 'currency',
        currency: pool.currency,
        maximumFractionDigits: 6,
      }).format(units / 1_000_000)
    : t('cloud.requests', { count: units, value: new Intl.NumberFormat(language).format(units) });
}

export function formatQuotaWindow(window: CloudQuotaWindow, language: string, t: TFunction) {
  if (window.window_type === 'subscription_month') return t('cloud.subscriptionMonth');
  if (window.window_type === 'calendar_day') return t('cloud.calendarDay');
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
