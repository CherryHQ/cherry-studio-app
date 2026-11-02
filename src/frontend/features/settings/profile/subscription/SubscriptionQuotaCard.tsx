import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { BottomSheet, Button, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import type { CloudQuotaPool, CloudQuotaWindow } from '@/shared/contracts/cloud';

import {
  formatQuotaQuantity,
  formatQuotaWindow,
  formatSubscriptionDate,
} from './subscriptionFormatters';

export function SubscriptionQuotaCard({
  pool,
  modelNames,
  showModelScope,
}: {
  pool: CloudQuotaPool;
  modelNames: ReadonlyMap<string, string>;
  showModelScope: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const quantity = (units: number) => formatQuotaQuantity(units, pool, i18n.language, t);
  const shared = pool.model_ids.length > 1;
  const title = shared ? t('cloud.sharedQuota') : t('cloud.quota');

  return (
    <View className="gap-3 rounded-2xl bg-card p-4">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-sm text-muted-foreground">{title}</Text>
        <Button size="inline" variant="ghost" onPress={() => setDetailsOpen(true)}>
          <Text className="text-sm text-muted-foreground">{t('cloud.quotaDetails')}</Text>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </Button>
      </View>
      {showModelScope ? (
        <View className="gap-2">
          <Text className="font-medium text-base text-foreground">{pool.display_name}</Text>
          <Text className="text-xs text-muted-foreground">
            {t('cloud.sharedModels', {
              models: pool.model_ids
                .map((id) => modelNames.get(id) ?? t('aiUsage.unknownModel'))
                .join(', '),
            })}
          </Text>
        </View>
      ) : null}
      {pool.windows.length === 0 ? <Text className="text-3xl text-foreground">—</Text> : null}
      {pool.windows.map((window, index) => (
        <View
          key={`${window.window_type}:${window.duration_seconds}`}
          className={index > 0 ? 'border-t border-border pt-4' : undefined}
        >
          <QuotaWindowSummary pool={pool} window={window} />
        </View>
      ))}

      {detailsOpen ? (
        <BottomSheet
          open
          onClose={() => setDetailsOpen(false)}
          size="large"
          title={t('cloud.quotaDetails')}
          closeAction={{ accessibilityLabel: t('common.close') }}
        >
          <ScrollView
            contentContainerClassName="gap-5 px-5 pb-8"
            showsVerticalScrollIndicator={false}
          >
            <Text className="font-semibold text-xl text-foreground">{pool.display_name}</Text>
            {shared ? (
              <Text className="text-sm text-muted-foreground">{t('cloud.sharedQuotaHint')}</Text>
            ) : null}
            {pool.windows.map((window) => (
              <Section
                key={`${window.window_type}:${window.duration_seconds}`}
                title={formatQuotaWindow(window, i18n.language, t)}
              >
                {[
                  [t('cloud.availableQuota'), quantity(window.remaining_units)],
                  [t('cloud.totalQuota'), quantity(window.limit_units)],
                  [t('cloud.usedQuota'), quantity(window.used_units)],
                  [t('cloud.reservedQuota'), quantity(window.active_reserved_units)],
                  [
                    t('cloud.periodStart'),
                    formatSubscriptionDate(window.period_start, i18n.language, true),
                  ],
                  [
                    t('cloud.periodEnd'),
                    formatSubscriptionDate(window.period_end, i18n.language, true),
                  ],
                  [
                    t('cloud.recoveryTime'),
                    formatSubscriptionDate(window.next_recovery_at, i18n.language, true),
                  ],
                ].map(([label, value]) => (
                  <Section.Item
                    key={label}
                    label={label}
                    trailing={<Text className="text-right text-base text-foreground">{value}</Text>}
                  />
                ))}
              </Section>
            ))}
            {pool.model_ids.length > 0 ? (
              <Section title={t('cloud.includedModels')}>
                {pool.model_ids.map((id) => (
                  <Section.Item
                    key={id}
                    label={modelNames.get(id) ?? t('aiUsage.unknownModel')}
                    description={id}
                  />
                ))}
              </Section>
            ) : null}
          </ScrollView>
        </BottomSheet>
      ) : null}
    </View>
  );
}

function QuotaWindowSummary({ pool, window }: { pool: CloudQuotaPool; window: CloudQuotaWindow }) {
  const { t, i18n } = useTranslation();
  const quantity = (units: number) => formatQuotaQuantity(units, pool, i18n.language, t);
  const remaining = quantity(window.remaining_units);
  const limit = quantity(window.limit_units);
  const ratio =
    window.limit_units > 0 ? Math.min(window.remaining_units / window.limit_units, 1) : 0;

  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="text-xs text-muted-foreground">{t('cloud.availableQuota')}</Text>
        <View className="flex-row flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Text className="font-semibold text-3xl text-foreground tabular-nums">{remaining}</Text>
          <Text className="shrink text-sm text-muted-foreground">
            {t('cloud.quotaLimit', { limit })}
          </Text>
        </View>
      </View>
      {window.limit_units > 0 ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('cloud.availableQuota')}
          accessibilityValue={{
            min: 0,
            max: 100,
            now: Math.round(ratio * 100),
            text: t('cloud.remaining', { remaining, limit }),
          }}
          className="h-1.5 overflow-hidden rounded-full bg-border-subtle"
        >
          <View className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
        </View>
      ) : null}
      <View className="flex-row gap-4">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-xs text-muted-foreground">{t('cloud.usedQuota')}</Text>
          <Text className="text-sm text-foreground tabular-nums">
            {quantity(window.used_units)}
          </Text>
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-xs text-muted-foreground">{t('cloud.reservedQuota')}</Text>
          <Text className="text-sm text-foreground tabular-nums">
            {quantity(window.active_reserved_units)}
          </Text>
        </View>
      </View>
      {window.remaining_units === 0 ? (
        <Text className="text-sm text-warning">{t('cloud.quotaExhausted')}</Text>
      ) : null}
      <View className="gap-2 border-t border-border pt-3">
        <Text className="text-sm text-foreground">
          {formatQuotaWindow(window, i18n.language, t)}
        </Text>
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text className="text-xs text-muted-foreground">{t('cloud.recoveryTime')}</Text>
          <Text className="text-xs text-muted-foreground">
            {formatSubscriptionDate(window.next_recovery_at, i18n.language, true)}
          </Text>
        </View>
      </View>
    </View>
  );
}
