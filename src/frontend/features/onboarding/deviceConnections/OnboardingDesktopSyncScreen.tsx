import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  useDesktopConnectionActions,
  useDesktopConnections,
} from '@/frontend/hooks/useDesktopConnections';
import type {
  DesktopImportPreview,
  DesktopImportUnavailableReason,
} from '@/shared/data/api/schemas/desktopConnections';

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
  const devices = useDesktopConnections();
  const actions = useDesktopConnectionActions();
  const { preview } = actions;
  const [loaded, setLoaded] = useState<{
    id: string;
    name: string;
    preview: DesktopImportPreview;
  } | null>(null);
  const [error, setError] = useState<unknown>();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const requested = useRef<string | null>(null);
  const available = devices.connections.filter(
    (connection) =>
      connection.status === 'paired' &&
      connection.capabilities.includes('configuration') &&
      (!connectionId || connection.id === connectionId),
  );
  const singleId = available.length === 1 ? available[0]?.id : undefined;
  const singleName = available.length === 1 ? available[0]?.name : undefined;
  const load = useCallback(
    async (id: string, name: string) => {
      requested.current = id;
      setError(undefined);
      try {
        const nextPreview = await preview(id);
        if (!nextPreview) return;
        setLoaded({ id, name, preview: nextPreview });
        setSelected(
          new Set(
            nextPreview.providers
              .filter((provider) => !provider.unavailableReason)
              .map((provider) => provider.id),
          ),
        );
      } catch (failure) {
        setError(failure);
      }
    },
    [preview],
  );
  useEffect(() => {
    if (
      !devices.isLoading &&
      singleId &&
      singleName &&
      !loaded &&
      !error &&
      requested.current !== singleId
    )
      void load(singleId, singleName);
  }, [devices.isLoading, singleId, singleName, loaded, error, load]);
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const retry = () => {
    const connection = available.find((device) => device.id === requested.current);
    if (connection) void load(connection.id, connection.name);
    else void devices.refetch();
  };
  const apply = async () => {
    if (!loaded || actions.isImporting || selected.size === 0) return;
    setError(undefined);
    try {
      const result = await actions.importSelected(loaded.id, {
        selections: [...selected].map((providerId) => ({ mode: 'provider-models', providerId })),
      });
      if (result)
        router.replace({ pathname: '/onboarding/model', params: { connectionId: loaded.id } });
    } catch (failure) {
      setError(failure);
    }
  };
  const busy = actions.isPreviewing || actions.isImporting;
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
              disabled={selected.size === 0 || actions.isPreviewing}
              loading={actions.isImporting}
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
      {devices.isLoading || actions.isPreviewing ? (
        <OnboardingMessage loading>{t('settings.provider.desktopSync.fetching')}</OnboardingMessage>
      ) : null}
      {devices.error || error ? (
        <View className="gap-3">
          <OnboardingMessage>{errorMessage(error ?? devices.error)}</OnboardingMessage>
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
      ) : !devices.isLoading && !devices.error && !actions.isPreviewing ? (
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
                onPress={() => void load(connection.id, connection.name)}
                title={connection.name}
              />
            ))
          )}
        </View>
      ) : null}
    </OnboardingPage>
  );
}
