import { cn } from '@cherrystudio/ui/utils';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { CloudQuotaWindow } from '@/shared/contracts/cloud';

import { formatQuotaWindow, formatSubscriptionDate } from './subscriptionFormatters';

export function SubscriptionQuotaCard({ windows }: { windows: readonly CloudQuotaWindow[] }) {
  return (
    <View className="rounded-2xl bg-card px-5">
      {windows.map((window, index) => (
        <View
          className={cn('py-5', index > 0 && 'border-t border-border')}
          key={`${window.window_type}:${window.duration_seconds}`}
        >
          <QuotaWindowSummary window={window} />
        </View>
      ))}
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
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-4">
        <Text className="min-w-0 flex-1 font-medium text-base text-foreground">{label}</Text>
        <Text className="font-semibold text-2xl text-foreground tabular-nums">{remaining}</Text>
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
        <View className="flex-row flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <Text className="text-xs text-muted-foreground">{t('cloud.recoveryTime')}</Text>
          <Text className="text-xs text-muted-foreground tabular-nums">
            {formatSubscriptionDate(window.next_recovery_at, i18n.language)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
