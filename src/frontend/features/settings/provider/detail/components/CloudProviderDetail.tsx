import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { ContentState, Section } from '@cherrystudio/ui/components';
import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Text } from 'react-native';

import { useAccount } from '@/frontend/appShell/account';
import { ModelAvatar } from '@/frontend/components/Avatar';
import { useCloud } from '@/frontend/hooks/useCloud';
import {
  CLOUD_PROVIDER_ID,
  CLOUD_PROVIDER_NAME,
  isCloudAmdModel,
  isCloudFreeModel,
  isCloudModelListed,
} from '@/shared/contracts/cloud';
import { createUniqueModelId } from '@/shared/data/types/model';

import { SettingsScrollPage } from '../../../components/SettingsScrollPage';
import { CloudAmdSection } from './CloudAmdSection';

/** Plan models are supplied by the account, without editable connection or model settings. */
export function CloudProviderDetail() {
  const { t } = useTranslation();
  const { state: account } = useAccount();
  const { cloud, state } = useCloud();
  const canLoad = account.isSignedIn && !account.isEnterprise && !account.isRestoringSession;
  const canLoadAmd =
    canLoad && state.phase === 'ready' && state.account?.account.status === 'active';
  const refresh = useCallback(() => {
    if (!canLoad) return;
    void cloud.refresh().catch(() => {});
    void cloud.refreshAmd();
  }, [canLoad, cloud]);
  useFocusEffect(
    useCallback(() => {
      if (!canLoad) return;
      void cloud.refresh().catch(() => {});
      const subscription = AppState.addEventListener('change', (appState) => {
        if (appState === 'active') refresh();
      });
      return () => subscription.remove();
    }, [canLoad, cloud, refresh]),
  );
  useFocusEffect(
    useCallback(() => {
      if (canLoadAmd) void cloud.refreshAmd();
    }, [canLoadAmd, cloud]),
  );

  if (!account.isRestoringSession && !canLoad) {
    return <Redirect href="/settings/provider" />;
  }
  const listedModels = state.models.filter(
    (model) =>
      isCloudModelListed(state, model.id) ||
      (canLoadAmd && state.amd?.phase === 'ready' && isCloudAmdModel(model)),
  );
  const isLoading = account.isRestoringSession || state.phase === 'loading';

  return (
    <SettingsScrollPage
      contentClassName="gap-4"
      headerProps={{
        title: CLOUD_PROVIDER_NAME,
        rightActions: [
          {
            accessibilityLabel: t('settings.provider.models.syncTitle'),
            disabled: isLoading || state.isRefreshing,
            icon: RefreshCwIcon,
            key: 'refresh-plan-models',
            nativeIcon: require('@/assets/header-toolbar/refresh-cw.png'),
            onPress: refresh,
            type: 'icon',
          },
        ],
      }}
    >
      {canLoad && state.account?.account.status === 'active' ? (
        <CloudAmdSection amd={state.amd} cloud={cloud} />
      ) : null}
      {state.phase === 'error' ? (
        <ContentState.Error
          title={t('settings.provider.models.management.loadFailed')}
          primaryAction={{
            children: t('common.retry'),
            disabled: state.isRefreshing,
            onPress: refresh,
          }}
        />
      ) : isLoading ? (
        <ContentState.Loading title={t('settings.provider.models.loading')} />
      ) : listedModels.length === 0 ? (
        <ContentState.Empty title={t('settings.provider.models.empty')} />
      ) : (
        <Section>
          {listedModels.map((model) => (
            <Section.Item
              accessibilityLabel={model.display_name}
              description={
                isCloudAmdModel(model) && model.activation_required !== false
                  ? t('cloud.amd.activationRequired')
                  : isCloudFreeModel(state, model)
                    ? t('models.capability.free')
                    : undefined
              }
              key={model.id}
              label={
                <Text className="text-base text-foreground" numberOfLines={1}>
                  {model.display_name}
                </Text>
              }
              leading={
                <ModelAvatar
                  model={{
                    id: createUniqueModelId(CLOUD_PROVIDER_ID, model.id),
                    modelId: model.id,
                    name: model.display_name,
                    providerId: CLOUD_PROVIDER_ID,
                  }}
                />
              }
              showChevron={false}
            />
          ))}
        </Section>
      )}
    </SettingsScrollPage>
  );
}
