import ClockIcon from '@cherrystudio/app-icons/icons/clock';
import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { ContentState } from '@cherrystudio/ui/components';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useCloud } from '@/frontend/hooks/useCloud';

import { SettingsScrollPage } from '../../components/SettingsScrollPage';
import { formatSubscriptionDate } from './subscriptionFormatters';
import { SubscriptionPlanCard } from './SubscriptionPlanCard';

export default function SubscriptionScreen() {
  const { t, i18n } = useTranslation();
  const { cloud, state } = useCloud();
  useEffect(() => {
    void cloud.refresh().catch(() => {});
  }, [cloud]);
  const refresh = () => void cloud.refresh().catch(() => {});

  return (
    <SettingsScrollPage
      contentClassName="gap-6 px-5"
      headerProps={{
        title: t('cloud.title'),
        rightActions: [
          {
            key: 'refresh',
            type: 'icon',
            icon: RefreshCwIcon,
            nativeIcon: 'arrow.clockwise',
            accessibilityLabel: t(state.isRefreshing ? 'cloud.loading' : 'cloud.refresh'),
            disabled: state.isRefreshing || state.phase === 'signed_out',
            onPress: refresh,
          },
        ],
      }}
    >
      {!state.plans ? (
        state.phase === 'signed_out' ? (
          <ContentState.Empty title={t('cloud.signedOut')} />
        ) : state.phase === 'error' ? (
          <ContentState.Error
            title={t('cloud.unavailable')}
            primaryAction={{
              children: t('cloud.refresh'),
              disabled: state.isRefreshing,
              onPress: refresh,
            }}
          />
        ) : (
          <ContentState.Loading title={t('cloud.loading')} />
        )
      ) : (
        <>
          {state.phase === 'error' ? (
            <Text accessibilityRole="alert" className="text-sm text-muted-foreground">
              {t('cloud.stale')}
            </Text>
          ) : null}
          {state.plans.entitlements.length === 0 ? (
            <ContentState.Empty title={t('cloud.noPlans')} />
          ) : null}
          {state.plans.entitlements.map((entitlement) => (
            <SubscriptionPlanCard
              key={entitlement.id}
              entitlement={entitlement}
              models={state.models}
            />
          ))}
          <View className="flex-row items-center justify-center gap-2 py-2">
            <ClockIcon className="size-3 text-muted-foreground" />
            <Text className="shrink text-center text-xs text-muted-foreground">
              {state.isRefreshing
                ? t('cloud.loading')
                : t('cloud.measuredAt', {
                    time: formatSubscriptionDate(state.plans.measured_at, i18n.language, true),
                  })}
            </Text>
          </View>
        </>
      )}
    </SettingsScrollPage>
  );
}
