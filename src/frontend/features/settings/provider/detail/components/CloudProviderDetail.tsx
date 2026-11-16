import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { ContentState, Section } from '@cherrystudio/ui/components';
import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelAvatar } from '@/frontend/components/Avatar';
import { useCloud } from '@/frontend/hooks/useCloud';
import {
  CLOUD_PROVIDER_ID,
  CLOUD_PROVIDER_NAME,
  cloudModelUnavailable,
} from '@/shared/contracts/cloud';

import { SettingsScrollPage } from '../../../components/SettingsScrollPage';
import { useProviderDetailSettings } from '../hooks/useProviderDetailSettings';

/** Plan models are supplied by the account, without editable connection or model settings. */
export function CloudProviderDetail() {
  const { t } = useTranslation();
  const { cloud, state } = useCloud();
  const { models, modelsQuery, provider, providerQuery } =
    useProviderDetailSettings(CLOUD_PROVIDER_ID);
  useEffect(() => {
    void cloud.refresh().catch(() => {});
  }, [cloud]);
  const entitledModels = models.filter((model) =>
    (['agent', 'general'] as const).some((use) => {
      const reason = cloudModelUnavailable(state, model.modelId, use);
      return reason === undefined || reason === 'quota_exhausted';
    }),
  );
  const isLoading = state.phase === 'loading' || providerQuery.isPending || modelsQuery.isPending;
  const refresh = async () => {
    await cloud.refresh().catch(() => {});
    await Promise.all([providerQuery.refetch(), modelsQuery.refetch()]);
  };

  if (
    state.phase === 'signed_out' ||
    providerQuery.isError ||
    (state.phase === 'ready' && !isLoading && !modelsQuery.isError && entitledModels.length === 0)
  ) {
    return <Redirect href="/settings/provider" />;
  }

  return (
    <SettingsScrollPage
      headerProps={{
        title: provider?.name ?? CLOUD_PROVIDER_NAME,
        rightActions: [
          {
            accessibilityLabel: t('settings.provider.models.syncTitle'),
            disabled: state.isRefreshing,
            icon: RefreshCwIcon,
            key: 'refresh-plan-models',
            nativeIcon: require('@/assets/header-toolbar/refresh-cw.png'),
            onPress: () => void refresh(),
            type: 'icon',
          },
        ],
      }}
    >
      {state.phase === 'error' || modelsQuery.isError ? (
        <ContentState.Error
          title={t('settings.provider.models.management.loadFailed')}
          primaryAction={{
            children: t('common.retry'),
            disabled: state.isRefreshing,
            onPress: () => void refresh(),
          }}
        />
      ) : isLoading ? (
        <ContentState.Loading title={t('settings.provider.models.loading')} />
      ) : (
        <Section>
          {entitledModels.map((model) => (
            <Section.Item
              description={model.modelId}
              key={model.id}
              label={model.name}
              leading={<ModelAvatar model={model} provider={provider} />}
              showChevron={false}
            />
          ))}
        </Section>
      )}
    </SettingsScrollPage>
  );
}
