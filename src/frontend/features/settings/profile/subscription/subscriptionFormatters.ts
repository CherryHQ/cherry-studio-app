import type { TFunction } from 'i18next';

import type { CloudPlans } from '@/shared/contracts/cloud';

const INTERVAL_KEYS = {
  day: 'cloud.perDay',
  week: 'cloud.perWeek',
  month: 'cloud.perMonth',
  year: 'cloud.perYear',
} as const;

export function formatSubscriptionDate(value: string, language: string) {
  return new Date(value).toLocaleString(language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatSubscriptionPrice(
  plan: CloudPlans['entitlements'][number]['plan'],
  language: string,
  t: TFunction,
) {
  const price = plan.subscription_price;
  if (!price) return undefined;
  const amount = new Intl.NumberFormat(language, {
    style: 'currency',
    currency: price.currency,
  }).format(price.unit_amount / 100);
  const interval = Object.hasOwn(INTERVAL_KEYS, price.interval)
    ? t(INTERVAL_KEYS[price.interval as keyof typeof INTERVAL_KEYS])
    : '';
  return interval ? t('cloud.pricePerInterval', { amount, interval }) : amount;
}
