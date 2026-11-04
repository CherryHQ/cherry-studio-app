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
  const price = subscription
    ? formatSubscriptionPrice(subscription.plan, i18n.language, t)
    : undefined;
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
    <Button accessibilityRole="link" onPress={() => void openSubscriptionWeb()} variant="outline">
      <Text className="shrink text-center font-medium text-sm text-foreground">
        {t(!state.plans || subscription ? 'cloud.manageOnWeb' : 'cloud.subscribe')}
      </Text>
      <ExternalLinkIcon className="size-4 text-foreground" />
    </Button>
  ) : null;

  return (
    <SettingsScrollPage
      contentClassName="gap-6"
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
          <View className="flex-row flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
            <View className="min-w-0 max-w-full grow gap-1">
              <Text accessibilityRole="header" className="font-medium text-base text-foreground">
                {plan?.display_name ?? t('cloud.noPlans')}
              </Text>
              {price ? <Text className="text-xs text-muted-foreground">{price}</Text> : null}
            </View>
            {webAction ? <View className="max-w-full">{webAction}</View> : null}
          </View>
          <View className="gap-3">
            <Text accessibilityRole="header" className="font-medium text-sm text-foreground">
              {t('cloud.usage')}
            </Text>
            {pools.length > 0 ? (
              <SubscriptionQuotaCard pools={pools} />
            ) : (
              <View className="min-h-24 items-center justify-center rounded-2xl border border-border bg-card px-4 py-6">
                <ContentState.Empty
                  description={t(
                    subscription ? 'cloud.noQuota' : 'cloud.subscribeToViewUsageDescription',
                  )}
                />
              </View>
            )}
          </View>
        </>
      )}
      {!state.plans && webAction ? <View className="items-start">{webAction}</View> : null}
    </SettingsScrollPage>
  );
}
