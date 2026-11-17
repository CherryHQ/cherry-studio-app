import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useDesktopProviderSync } from '@/frontend/hooks/useDesktopProviderSync';
import type { DesktopImportUnavailableReason } from '@/shared/data/api/schemas/desktopConnections';

import {
  OnboardingButton,
  OnboardingChoice,
  OnboardingMessage,
  OnboardingOption,
  OnboardingPage,
} from '../components/OnboardingPage';

const UNAVAILABLE_KEYS = {
  'missing-api-key': 'settings.provider.desktopSync.unavailable.missing-api-key',
  unreadable: 'settings.provider.desktopSync.unavailable.unreadable',
  'unsupported-auth': 'settings.provider.desktopSync.unavailable.unsupported-auth',
  'unsupported-endpoint': 'settings.provider.desktopSync.unavailable.unsupported-endpoint',
} as const satisfies Record<DesktopImportUnavailableReason, string>;

export function OnboardingDesktopSyncScreen({
  connectionId,
  errorMessage,
}: {
  connectionId?: string;
  errorMessage: (error: unknown) => string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const sync = useDesktopProviderSync(connectionId);
  const {
    availableConnections: available,
    loadedPreview,
    selectedProviderIds: selected,
    toggleProvider: toggle,
    loadPreview,
    retryPreview,
    previewError,
  } = sync;
  const [importError, setImportError] = useState<unknown>();
  const error = importError ?? previewError;
  const loaded = loadedPreview && {
    id: loadedPreview.connection.id,
    name: loadedPreview.connection.name,
    preview: loadedPreview.preview,
  };
  const retry = () => {
    setImportError(undefined);
    retryPreview();
  };
  const apply = async () => {
    setImportError(undefined);
    try {
      const result = await sync.apply();
      if (result && loadedPreview)
        router.replace({
          pathname: '/onboarding/model',
          params: { connectionId: loadedPreview.connection.id },
        });
    } catch (failure) {
      setImportError(failure);
    }
  };
  const busy = sync.isPreviewing || sync.isImporting;
  return (
    <OnboardingPage
      description={
        loaded
          ? t('settings.provider.desktopSync.source', { name: loaded.name })
          : t('onboarding.device.description')
      }
      footer={
        loaded ? (
          <>
            <Text className="text-center text-xs text-muted-foreground">
              {t('settings.provider.desktopSync.credentialsNotice')}
            </Text>
            <OnboardingButton
              disabled={selected.size === 0 || sync.isPreviewing}
              loading={sync.isImporting}
              onPress={() => void apply()}
            >
              {t('settings.provider.desktopSync.apply', { count: selected.size })}
            </OnboardingButton>
            <OnboardingButton disabled={busy} onPress={retry} variant="text">
              {t('settings.provider.desktopSync.retry')}
            </OnboardingButton>
          </>
        ) : undefined
      }
      onBack={busy ? undefined : () => router.replace('/onboarding')}
      step={{ current: 2, total: 3, label: t('onboarding.step', { current: 2 }) }}
      testID="onboarding-desktop-sync"
      title={t('settings.provider.desktopSync.title')}
    >
      {sync.isLoading || sync.isPreviewing ? (
        <OnboardingMessage loading>{t('settings.provider.desktopSync.fetching')}</OnboardingMessage>
      ) : null}
      {sync.error || error ? (
        <View className="gap-3">
          <OnboardingMessage>{errorMessage(error ?? sync.error)}</OnboardingMessage>
          <OnboardingButton onPress={retry}>{t('common.retry')}</OnboardingButton>
        </View>
      ) : null}
      {loaded ? (
        <View className="gap-3">
          {loaded.preview.providers.length === 0 ? (
            <OnboardingMessage>
              {t('settings.provider.desktopSync.emptyDescription')}
            </OnboardingMessage>
          ) : (
            loaded.preview.providers.map((provider) => (
              <OnboardingChoice
                checked={selected.has(provider.id)}
                description={
                  provider.unavailableReason
                    ? t(UNAVAILABLE_KEYS[provider.unavailableReason])
                    : (provider.accountNotice
                        ? `${t('settings.provider.desktopSync.accountNotice')}\n`
                        : '') +
                      t('settings.provider.desktopSync.providerDescription', {
                        count: provider.models.length,
                      })
                }
                disabled={busy || Boolean(provider.unavailableReason)}
                key={provider.id}
                onPress={() => toggle(provider.id)}
                title={provider.name}
              />
            ))
          )}
        </View>
      ) : !sync.isLoading && !sync.error && !sync.isPreviewing ? (
        <View className="gap-3">
          {available.length === 0 ? (
            <>
              <OnboardingMessage>
                {t(
                  connectionId
                    ? 'settings.provider.desktopSync.deviceUnavailableDescription'
                    : 'settings.provider.desktopSync.noDeviceDescription',
                )}
              </OnboardingMessage>
              <OnboardingButton onPress={() => router.replace('/onboarding/device-connections')}>
                {t('settings.provider.desktopSync.openDeviceConnections')}
              </OnboardingButton>
            </>
          ) : (
            available.map((connection) => (
              <OnboardingOption
                key={connection.id}
                onPress={() => void loadPreview(connection)}
                title={connection.name}
              />
            ))
          )}
        </View>
      ) : null}
    </OnboardingPage>
  );
}
