import ClockIcon from '@cherrystudio/app-icons/icons/clock';
import ExternalLinkIcon from '@cherrystudio/app-icons/icons/external-link';
import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { Button, ContentState } from '@cherrystudio/ui/components';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useCloud } from '@/frontend/hooks/useCloud';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

import { SettingsScrollPage } from '../../components/SettingsScrollPage';
import { formatSubscriptionPrice } from './subscriptionFormatters';
import { getSubscriptionOverview } from './subscriptionOverview';
import { SubscriptionQuotaCard } from './SubscriptionQuotaCard';

export default function SubscriptionScreen() {
  const { t, i18n } = useTranslation();
  const { cloud, state } = useCloud();
  const { subscription, plan } = getSubscriptionOverview(state.plans);
  const pools = subscription?.quota_pools.filter((pool) => pool.windows.length > 0) ?? [];
  const price = plan ? formatSubscriptionPrice(plan, i18n.language, t) : undefined;
  useEffect(() => {
    void cloud.refresh().catch(() => {});
  }, [cloud]);
  const refresh = () => void cloud.refresh().catch(() => {});
  const openSubscriptionWeb = async () => {
    const url = cloud.getState().webUrl;
    if (!url) return;
    await openExternalUrl(url);
    await cloud.refresh().catch(() => {});
  };
  const webAction = state.webUrl ? (
    <Button
      accessibilityRole="link"
      onPress={() => void openSubscriptionWeb()}
      shape="pill"
      variant="secondary"
    >
      <Text className="shrink text-center font-medium text-sm text-foreground">
        {t(!state.plans || subscription ? 'cloud.manageOnWeb' : 'cloud.subscribe')}
      </Text>
      <ExternalLinkIcon className="size-4 text-foreground" />
    </Button>
  ) : null;

  return (
    <SettingsScrollPage
      contentClassName="gap-10 px-6 pt-7"
      headerProps={{
        title: t('cloud.title'),
        rightActions: [
          {
            key: 'refresh',
            type: 'icon',
            icon: RefreshCwIcon,
            nativeIcon: require('@/assets/header-toolbar/refresh-cw.png'),
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
          <View className="items-start gap-2">
            {plan ? (
              <Text className="text-sm text-muted-foreground">
                {t(subscription ? 'cloud.currentPlan' : 'cloud.availablePlan')}
              </Text>
            ) : null}
            <Text accessibilityRole="header" className="font-semibold text-3xl text-foreground">
              {plan?.display_name ?? t('cloud.noPlans')}
            </Text>
            {price ? <Text className="text-base text-muted-foreground">{price}</Text> : null}
            {webAction ? <View className="pt-3">{webAction}</View> : null}
          </View>
          <View className="gap-3">
            <View className="flex-row flex-wrap items-baseline justify-between gap-3">
              <Text accessibilityRole="header" className="font-semibold text-lg text-foreground">
                {t('cloud.usage')}
              </Text>
              {pools.length > 0 ? (
                <Text className="text-xs text-muted-foreground">{t('cloud.remainingQuota')}</Text>
              ) : null}
            </View>
            {pools.length > 0 ? (
              pools.map((pool) => (
                <View className="gap-2" key={pool.allocation_id}>
                  {pools.length > 1 ? (
                    <Text className="font-medium text-base text-foreground">
                      {pool.display_name}
                    </Text>
                  ) : null}
                  <SubscriptionQuotaCard windows={pool.windows} />
                </View>
              ))
            ) : (
              <View className="rounded-2xl bg-card px-5 py-7">
                <ContentState.Empty
                  description={
                    subscription ? undefined : t('cloud.subscribeToViewUsageDescription')
                  }
                  title={t(subscription ? 'cloud.noQuota' : 'cloud.subscribeToViewUsage')}
                />
              </View>
            )}
            {subscription ? (
              <View className="flex-row items-center justify-center gap-1.5 pt-1">
                <ClockIcon className="size-3 text-muted-foreground" />
                <Text className="shrink text-center text-xs text-muted-foreground">
                  {state.isRefreshing
                    ? t('cloud.loading')
                    : t('cloud.measuredAt', {
                        time: new Date(state.plans.measured_at).toLocaleTimeString(i18n.language, {
                          hour: '2-digit',
                          minute: '2-digit',
                        }),
                      })}
                </Text>
              </View>
            ) : null}
          </View>
        </>
      )}
      {!state.plans && webAction ? <View className="items-start">{webAction}</View> : null}
    </SettingsScrollPage>
  );
}
