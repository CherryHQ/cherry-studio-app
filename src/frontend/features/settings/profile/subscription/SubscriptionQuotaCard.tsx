import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { formatQuotaWindow } from '@/frontend/utils/cloudQuota';
import type { CloudQuotaPool, CloudQuotaWindow } from '@/shared/contracts/cloud';

import { formatSubscriptionDate } from './subscriptionFormatters';

export function SubscriptionQuotaCard({ pools }: { pools: readonly CloudQuotaPool[] }) {
  return (
    <View className="gap-6 rounded-2xl border border-border bg-card px-4 py-5">
      {pools.flatMap((pool) =>
        pool.windows.map((window) => (
          <QuotaWindowSummary
            key={`${pool.allocation_id}:${window.window_type}:${window.duration_seconds}`}
            window={window}
          />
        )),
      )}
    </View>
  );
}

function QuotaWindowSummary({ window }: { window: CloudQuotaWindow }) {
  const { t, i18n } = useTranslation();
  const ratio =
    window.limit_units > 0 ? Math.min(window.remaining_units / window.limit_units, 1) : 0;
  const remaining = ratio.toLocaleString(i18n.language, {
    style: 'percent',
    maximumFractionDigits: 0,
  });
  const label = formatQuotaWindow(window, i18n.language, t);

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Text className="shrink font-medium text-xs text-foreground">{label}</Text>
        <Text className="text-xs text-muted-foreground tabular-nums">
          {t('cloud.remainingPercent', { percent: remaining })}
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(ratio * 100),
          text: t('cloud.remainingPercent', { percent: remaining }),
        }}
        className="h-1.5 overflow-hidden rounded-full bg-secondary"
      >
        <View className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
      </View>
      {window.next_recovery_at ? (
        <Text className="text-xs text-muted-foreground tabular-nums">
          {t('cloud.recoveryTime', {
            time: formatSubscriptionDate(window.next_recovery_at, i18n.language),
          })}
        </Text>
      ) : null}
    </View>
  );
}
