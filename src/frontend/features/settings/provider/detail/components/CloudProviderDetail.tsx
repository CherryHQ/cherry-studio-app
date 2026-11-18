import ExternalLinkIcon from '@cherrystudio/app-icons/icons/external-link';
import LockIcon from '@cherrystudio/app-icons/icons/lock';
import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { ContentState, Section } from '@cherrystudio/ui/components';
import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, View } from 'react-native';

import { useAccount } from '@/frontend/appShell/account';
import { toCloudModelPreview, useCloudAmdModelAction } from '@/frontend/appShell/cloud';
import { useCloud } from '@/frontend/hooks/useCloud';
import {
  CLOUD_PROVIDER_NAME,
  cloudModelUnavailable,
  isCloudAmdModel,
  isCloudFreeModel,
  isCloudModelListed,
} from '@/shared/contracts/cloud';

import { SettingsScrollPage } from '../../../components/SettingsScrollPage';
import { ProviderModelRow } from '../../models/components/ProviderModelRow';

/** Plan models are supplied by the account, without editable connection or model settings. */
export function CloudProviderDetail() {
  const { t } = useTranslation();
  const { state: account } = useAccount();
  const { cloud, state } = useCloud();
  const showAmdModelAction = useCloudAmdModelAction();
  const canLoad = account.isSignedIn && !account.isEnterprise && !account.isRestoringSession;
  const refresh = useCallback(() => {
    if (canLoad) void cloud.refreshProvider().catch(() => {});
  }, [canLoad, cloud]);
  useFocusEffect(
    useCallback(() => {
      if (!canLoad) return;
      refresh();
      const subscription = AppState.addEventListener('change', (appState) => {
        if (appState === 'active') refresh();
      });
      return () => subscription.remove();
    }, [canLoad, refresh]),
  );
  if (!account.isRestoringSession && !canLoad) {
    return <Redirect href="/settings/provider" />;
  }
  const listedModels = state.models.flatMap((model) => {
    const isAmd = isCloudAmdModel(model);
    const needsActivation =
      isAmd &&
      (cloudModelUnavailable(state, model.id, 'agent') === 'amd_activation_required' ||
        cloudModelUnavailable(state, model.id, 'general') === 'amd_activation_required');
    return needsActivation || isCloudModelListed(state, model.id)
      ? [{ model, isAmd, needsActivation }]
      : [];
  });
  const isLoading = account.isRestoringSession || state.phase === 'loading';

  return (
    <SettingsScrollPage
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
        <Section
          contentClassName="overflow-hidden rounded-2xl bg-card py-1"
          title={t('settings.provider.models.listTitle')}
          variant="plain"
        >
          {listedModels.map(({ model, isAmd, needsActivation }) => (
            <ProviderModelRow
              accessibilityHint={
                needsActivation
                  ? t('cloud.amd.activationRequired')
                  : isAmd
                    ? t('cloud.amd.viewUsage')
                    : undefined
              }
              endMark={
                <View className="w-5 items-center" importantForAccessibility="no-hide-descendants">
                  {needsActivation ? (
                    <LockIcon className="size-3.5 text-muted-foreground" />
                  ) : isAmd ? (
                    <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
                  ) : null}
                </View>
              }
              isCloudFree={isCloudFreeModel(state, model)}
              key={model.id}
              model={toCloudModelPreview(model)}
              onPress={isAmd ? () => void showAmdModelAction(model.id) : undefined}
              provider={undefined}
              variant="management"
            />
          ))}
        </Section>
      )}
    </SettingsScrollPage>
  );
}
