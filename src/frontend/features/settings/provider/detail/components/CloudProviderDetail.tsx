import ExternalLinkIcon from '@cherrystudio/app-icons/icons/external-link';
import LockIcon from '@cherrystudio/app-icons/icons/lock';
import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { ContentState, Section } from '@cherrystudio/ui/components';
import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, View } from 'react-native';

import {
  toCloudModelPreview,
  useCloudModelBrowser,
  useReturnedCloudModel,
} from '@/frontend/appShell/cloud';
import { CLOUD_PROVIDER_ID, CLOUD_PROVIDER_NAME } from '@/shared/contracts/cloud';
import { isEnterpriseProfile } from '@/shared/data/activeProfile';

import { SettingsScrollPage } from '../../../components/SettingsScrollPage';
import { ProviderModelRow } from '../../models/components/ProviderModelRow';

/** Plan models are supplied by the account, without editable connection or model settings. */
export function CloudProviderDetail() {
  const { t } = useTranslation();
  const path = `/settings/provider/${CLOUD_PROVIDER_ID}`;
  const {
    accountState: account,
    state,
    offers,
    press,
    refresh,
    explain,
  } = useCloudModelBrowser(!isEnterpriseProfile());
  useFocusEffect(
    useCallback(() => {
      refresh();
      const subscription = AppState.addEventListener('change', (appState) => {
        if (appState === 'active') refresh();
      });
      return () => subscription.remove();
    }, [refresh]),
  );
  useReturnedCloudModel({
    enabled: true,
    pathname: path,
    destination: path,
    state,
    account,
    resume: (id) => () => press(id, path),
  });
  if (isEnterpriseProfile() || account.isEnterprise) return <Redirect href="/settings/provider" />;
  const failed = state.phase === 'error' || state.guestCatalog === 'error';
  const isLoading =
    account.isRestoringSession ||
    (offers.size === 0 &&
      (state.phase === 'loading' ||
        (state.phase === 'signed_out' && state.guestCatalog !== 'ready')));

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
      {failed && offers.size === 0 ? (
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
      ) : offers.size === 0 ? (
        <ContentState.Empty title={t('settings.provider.models.empty')} />
      ) : (
        <Section
          contentClassName="overflow-hidden rounded-2xl bg-card py-1"
          title={t('settings.provider.models.listTitle')}
          variant="plain"
        >
          {Array.from(offers.values(), (offer) => (
            <ProviderModelRow
              accessibilityHint={
                offer.reason ? explain(offer) : offer.isAmd ? t('cloud.amd.viewUsage') : undefined
              }
              endMark={
                <View className="w-5 items-center" importantForAccessibility="no-hide-descendants">
                  {offer.reason ? (
                    <LockIcon className="size-3.5 text-muted-foreground" />
                  ) : offer.isAmd ? (
                    <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
                  ) : null}
                </View>
              }
              isCloudFree={offer.isFree}
              key={offer.model.id}
              model={toCloudModelPreview(offer.model)}
              onPress={offer.reason || offer.isAmd ? () => press(offer.model.id, path) : undefined}
              provider={undefined}
              variant="management"
            />
          ))}
        </Section>
      )}
    </SettingsScrollPage>
  );
}
