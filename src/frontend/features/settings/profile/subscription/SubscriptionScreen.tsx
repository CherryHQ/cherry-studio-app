import { Button, ContentState, Section } from '@cherrystudio/ui/components';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useCloud } from '@/frontend/hooks/useCloud';
import type { CloudPlans, CloudQuotaPool, CloudQuotaWindow } from '@/shared/contracts/cloud';

import { SettingsScrollPage } from '../../components/SettingsScrollPage';

const STATE_KEYS = {
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

export default function SubscriptionScreen() {
  const { t, i18n } = useTranslation();
  const { cloud, state } = useCloud();
  useEffect(() => {
    void cloud.refresh().catch(() => {});
  }, [cloud]);
  const date = (value: string) => new Date(value).toLocaleString(i18n.language);
  if (!state.plans) {
    return (
      <SettingsScrollPage headerProps={{ title: t('cloud.title') }}>
        {state.phase === 'signed_out' ? (
          <ContentState.Empty title={t('cloud.signedOut')} />
        ) : state.phase === 'error' ? (
          <ContentState.Error
            title={t('cloud.unavailable')}
            primaryAction={{
              children: t('cloud.refresh'),
              disabled: state.isRefreshing,
              onPress: () => void cloud.refresh().catch(() => {}),
            }}
          />
        ) : (
          <ContentState.Loading title={t('cloud.loading')} />
        )}
      </SettingsScrollPage>
    );
  }
  return (
    <SettingsScrollPage headerProps={{ title: t('cloud.title') }} contentClassName="gap-5">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-sm text-muted-foreground">
          {t('cloud.measuredAt', { time: date(state.plans.measured_at) })}
        </Text>
        <Button
          size="sm"
          variant="tonal"
          disabled={state.isRefreshing}
          onPress={() => void cloud.refresh().catch(() => {})}
        >
          {t(state.isRefreshing ? 'cloud.loading' : 'cloud.refresh')}
        </Button>
      </View>
      {state.phase === 'error' ? (
        <Text className="text-sm text-muted-foreground">{t('cloud.stale')}</Text>
      ) : null}
      {state.plans.entitlements.length === 0 ? (
        <ContentState.Empty title={t('cloud.noPlans')} />
      ) : null}
      {state.plans.entitlements.map((entitlement) => (
        <PlanDetails key={entitlement.id} entitlement={entitlement} />
      ))}
    </SettingsScrollPage>
  );
}

function PlanDetails({ entitlement }: { entitlement: CloudPlans['entitlements'][number] }) {
  const { t, i18n } = useTranslation();
  const date = (value: string) => new Date(value).toLocaleString(i18n.language);
  const { plan } = entitlement;
  const price = plan.subscription_price;
  const interval =
    price && Object.hasOwn(INTERVAL_KEYS, price.interval)
      ? t(INTERVAL_KEYS[price.interval as keyof typeof INTERVAL_KEYS])
      : '';
  const amount = price
    ? new Intl.NumberFormat(i18n.language, { style: 'currency', currency: price.currency }).format(
        price.unit_amount / 100,
      )
    : '';
  return (
    <View className="gap-4">
      <Section title={plan.display_name}>
        <Section.Item label={t('cloud.status')} value={t(STATE_KEYS[entitlement.state])} />
        <Section.Item
          label={t('cloud.planType')}
          value={t(plan.is_free ? 'cloud.free' : 'cloud.paid')}
        />
        {price ? (
          <Section.Item
            label={t('cloud.price')}
            value={`${amount}${interval ? ` ${interval}` : ''}`}
          />
        ) : null}
        <Section.Item label={t('cloud.startsAt')} value={date(entitlement.starts_at)} />
        {entitlement.expires_at ? (
          <Section.Item label={t('cloud.expiresAt')} value={date(entitlement.expires_at)} />
        ) : null}
      </Section>
      {entitlement.quota_pools.map((pool) => (
        <QuotaPoolDetails key={pool.allocation_id} pool={pool} />
      ))}
    </View>
  );
}

function QuotaPoolDetails({ pool }: { pool: CloudQuotaPool }) {
  const { t } = useTranslation();
  return (
    <View className="gap-3 px-4">
      <Text className="font-medium text-base text-foreground">{pool.display_name}</Text>
      <Text className="text-sm text-muted-foreground">
        {t('cloud.sharedModels', { models: pool.model_ids.join(', ') })}
      </Text>
      {pool.windows.map((window) => (
        <QuotaWindowDetails
          key={`${window.window_type}:${window.duration_seconds}`}
          pool={pool}
          window={window}
        />
      ))}
    </View>
  );
}

function QuotaWindowDetails({ pool, window }: { pool: CloudQuotaPool; window: CloudQuotaWindow }) {
  const { t, i18n } = useTranslation();
  const date = (value: string) => new Date(value).toLocaleString(i18n.language);
  const quantity = (units: number) =>
    pool.measurement_kind === 'money' && pool.currency
      ? new Intl.NumberFormat(i18n.language, {
          style: 'currency',
          currency: pool.currency,
          maximumFractionDigits: 6,
        }).format(units / 1_000_000)
      : t('cloud.requests', {
          count: units,
          value: new Intl.NumberFormat(i18n.language).format(units),
        });
  const windowLabel =
    window.window_type === 'subscription_month'
      ? t('cloud.subscriptionMonth')
      : window.window_type === 'calendar_day'
        ? t('cloud.calendarDay')
        : t('cloud.rollingHours', {
            count: window.duration_seconds / 3600,
            hours: new Intl.NumberFormat(i18n.language).format(window.duration_seconds / 3600),
          });
  return (
    <View className="gap-1">
      <Text className="text-sm text-muted-foreground">{windowLabel}</Text>
      <Text className="font-medium text-base text-foreground">
        {t('cloud.remaining', {
          remaining: quantity(window.remaining_units),
          limit: quantity(window.limit_units),
        })}
      </Text>
      <Text className="text-sm text-muted-foreground">
        {t('cloud.usedReserved', {
          used: quantity(window.used_units),
          reserved: quantity(window.active_reserved_units),
        })}
      </Text>
      {window.remaining_units === 0 ? (
        <Text className="text-sm text-warning">{t('cloud.quotaExhausted')}</Text>
      ) : null}
      {window.period_start && window.period_end ? (
        <Text className="text-sm text-muted-foreground">
          {t('cloud.period', { start: date(window.period_start), end: date(window.period_end) })}
        </Text>
      ) : null}
      {window.next_recovery_at ? (
        <Text className="text-sm text-muted-foreground">
          {t('cloud.nextRecovery', { time: date(window.next_recovery_at) })}
        </Text>
      ) : null}
    </View>
  );
}
