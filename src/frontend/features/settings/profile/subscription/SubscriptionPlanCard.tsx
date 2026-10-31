import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { BottomSheet, Image, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ModelAvatar } from '@/frontend/components/Avatar';
import { CLOUD_PROVIDER_ID, type CloudModel, type CloudPlans } from '@/shared/contracts/cloud';

import {
  formatSubscriptionDate,
  formatSubscriptionPrice,
  SUBSCRIPTION_STATE_KEYS,
} from './subscriptionFormatters';
import { SubscriptionQuotaCard } from './SubscriptionQuotaCard';

export function SubscriptionPlanCard({
  entitlement,
  models,
}: {
  entitlement: CloudPlans['entitlements'][number];
  models: readonly CloudModel[];
}) {
  const { t, i18n } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { plan, quota_pools: pools } = entitlement;
  const price = formatSubscriptionPrice(plan, i18n.language, t);
  const modelIds = [...new Set(pools.flatMap((pool) => pool.model_ids))];
  const modelNames = new Map(models.map((model) => [model.id, model.display_name]));

  return (
    <View className="gap-4">
      <View className="gap-4 rounded-3xl bg-foreground px-6 py-5">
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <View className="flex-row items-center gap-2">
            <Image className="size-6 rounded-md" source={require('@/assets/icon-light.png')} />
            <Text className="font-medium text-sm text-background">Cherry Cloud</Text>
          </View>
          <Text className="text-xs text-background">
            {t(SUBSCRIPTION_STATE_KEYS[entitlement.state])}
          </Text>
        </View>
        <Text accessibilityRole="header" className="font-semibold text-3xl text-background">
          {plan.display_name}
        </Text>
        <View className="flex-row flex-wrap items-end justify-between gap-3">
          <Text className="shrink font-medium text-xl text-background">{price}</Text>
          <View className="shrink gap-1">
            <Text className="text-xs text-background/80">{t('cloud.expiresAt')}</Text>
            <Text className="text-sm text-background/80">
              {formatSubscriptionDate(entitlement.expires_at, i18n.language)}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          className="min-h-11 flex-row items-center justify-between gap-3 border-t border-background/20 pt-3 active:opacity-70"
          onPress={() => setDetailsOpen(true)}
        >
          <Text className="shrink text-sm text-background">{t('cloud.planDetails')}</Text>
          <ChevronRightIcon className="size-4 text-background" />
        </Pressable>
      </View>

      {modelIds.length > 0 ? (
        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <Text
              accessibilityRole="header"
              className="min-w-0 flex-1 font-semibold text-lg text-foreground"
            >
              {t('cloud.includedModels')}
            </Text>
            <Text className="shrink text-xs text-muted-foreground">
              {t('cloud.modelCount', { count: modelIds.length })}
            </Text>
          </View>
          <View className="gap-2">
            {modelIds.map((id) => {
              const name = modelNames.get(id) ?? t('aiUsage.unknownModel');
              return (
                <View key={id} className="min-h-11 flex-row items-center gap-3">
                  <ModelAvatar
                    model={{ id, modelId: id, name, providerId: CLOUD_PROVIDER_ID }}
                    size={30}
                  />
                  <Text className="min-w-0 flex-1 text-base text-foreground">{name}</Text>
                </View>
              );
            })}
          </View>
          {pools.length === 1 && modelIds.length > 1 ? (
            <Text className="text-xs text-muted-foreground">{t('cloud.sharedQuotaHint')}</Text>
          ) : null}
        </View>
      ) : null}

      {pools.map((pool) => (
        <SubscriptionQuotaCard
          key={pool.allocation_id}
          pool={pool}
          modelNames={modelNames}
          showModelScope={pools.length > 1}
        />
      ))}

      {detailsOpen ? (
        <BottomSheet
          open
          onClose={() => setDetailsOpen(false)}
          size="large"
          title={t('cloud.planDetails')}
          closeAction={{ accessibilityLabel: t('common.close') }}
        >
          <ScrollView
            contentContainerClassName="gap-5 px-5 pb-8"
            showsVerticalScrollIndicator={false}
          >
            <Text className="font-semibold text-2xl text-foreground">{plan.display_name}</Text>
            <Section>
              {[
                [t('cloud.status'), t(SUBSCRIPTION_STATE_KEYS[entitlement.state])],
                [t('cloud.planType'), t(plan.is_free ? 'cloud.free' : 'cloud.paid')],
                [t('cloud.price'), price],
                [
                  t('cloud.startsAt'),
                  formatSubscriptionDate(entitlement.starts_at, i18n.language, true),
                ],
                [
                  t('cloud.expiresAt'),
                  formatSubscriptionDate(entitlement.expires_at, i18n.language, true),
                ],
              ].map(([label, value]) => (
                <Section.Item
                  key={label}
                  label={label}
                  trailing={<Text className="text-right text-base text-foreground">{value}</Text>}
                />
              ))}
            </Section>
            {modelIds.length > 0 ? (
              <Section title={t('cloud.includedModels')}>
                {modelIds.map((id) => (
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
