import {
  Button,
  ContentState,
  Section,
  SelectionIndicator,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { FirstUseSetupIntent } from '@/frontend/appShell/navigation';
import {
  useDesktopConnectionActions,
  useDesktopConnections,
} from '@/frontend/hooks/useDesktopConnections';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { DesktopImportPreview } from '@/shared/data/api/schemas/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

import { SettingsScrollPage } from '../../components/SettingsScrollPage';
import { desktopConnectionErrorMessage } from '../../desktopConnectionError';
import { ProviderAvatar } from '../components/ProviderAvatar';

type LoadedPreview = {
  connection: DesktopConnection;
  preview: DesktopImportPreview;
};

export default function DesktopProviderSyncScreen({
  setupIntent,
}: { setupIntent?: FirstUseSetupIntent } = {}) {
  const params = useLocalSearchParams<{ connectionId?: string | string[] }>();
  const connectionId = getSingleRouteParam(params.connectionId);

  return (
    <DesktopProviderSync
      connectionId={connectionId}
      key={`${setupIntent ?? 'settings'}:${connectionId ?? 'choose-device'}`}
      setupIntent={setupIntent}
    />
  );
}

function DesktopProviderSync({
  connectionId,
  setupIntent,
}: {
  connectionId?: string;
  setupIntent?: FirstUseSetupIntent;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { toast } = useToast();
  const { connections, error, isLoading, refetch } = useDesktopConnections();
  const { importSelected, isImporting, isPreviewing, preview } = useDesktopConnectionActions();
  const availableConnections = useMemo(
    () =>
      connections.filter(
        (connection) =>
          connection.status === 'paired' && (!connectionId || connection.id === connectionId),
      ),
    [connectionId, connections],
  );
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>();
  const [loadedPreview, setLoadedPreview] = useState<LoadedPreview>();
  const [previewError, setPreviewError] = useState<unknown>();
  const [selectedProviderIds, setSelectedProviderIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const automaticPreviewConnectionId = useRef<string | undefined>(undefined);
  const previewConnectionId = useRef<string | undefined>(undefined);

  const loadPreview = useCallback(
    async (connection: DesktopConnection) => {
      previewConnectionId.current = connection.id;
      setPreviewError(undefined);
      try {
        const nextPreview = await preview(connection.id);
        if (!nextPreview) return;
        setLoadedPreview({ connection, preview: nextPreview });
        setSelectedProviderIds(
          new Set(
            nextPreview.providers
              .filter((provider) => !provider.unavailableReason)
              .map((provider) => provider.id),
          ),
        );
      } catch (loadError) {
        setPreviewError(loadError);
      }
    },
    [preview],
  );

  useEffect(() => {
    if (isLoading || availableConnections.length !== 1 || loadedPreview || previewError) {
      return;
    }

    const [connection] = availableConnections;
    if (!connection || automaticPreviewConnectionId.current === connection.id) {
      return;
    }
    automaticPreviewConnectionId.current = connection.id;
    void loadPreview(connection);
    return () => {
      automaticPreviewConnectionId.current = undefined;
    };
  }, [availableConnections, isLoading, loadPreview, loadedPreview, previewError]);

  const openDeviceConnections = useCallback(() => {
    if (setupIntent === 'chat') router.dismissTo('/onboarding/device-connections');
    else router.push('/settings/device-connections');
  }, [router, setupIntent]);
  const continueWithSelectedConnection = useCallback(() => {
    const connection = availableConnections.find((item) => item.id === selectedConnectionId);
    if (connection) {
      void loadPreview(connection);
    }
  }, [availableConnections, loadPreview, selectedConnectionId]);
  const retryPreview = useCallback(() => {
    const connection = availableConnections.find((item) => item.id === previewConnectionId.current);
    if (connection) {
      void loadPreview(connection);
    }
  }, [availableConnections, loadPreview]);
  const toggleProvider = useCallback((providerId: string) => {
    setSelectedProviderIds((current) => {
      const next = new Set(current);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  }, []);
  const applySync = useCallback(async () => {
    if (!loadedPreview || selectedProviderIds.size === 0) {
      return;
    }

    try {
      const result = await importSelected(loadedPreview.connection.id, {
        selections: [...selectedProviderIds].map((providerId) => ({
          mode: 'provider-models',
          providerId,
        })),
      });
      if (!result) return;
      toast.show({
        label: t('settings.provider.desktopSync.success', {
          models: result.modelsAdded,
          providers: result.providersAdded,
          modelsSkipped: result.modelsSkipped,
          providersUpdated: result.providersUpdated,
        }),
        variant: 'success',
      });
      if (setupIntent === 'chat') {
        router.replace({
          params: { connectionId: loadedPreview.connection.id },
          pathname: '/onboarding/model',
        });
      } else {
        router.dismissTo('/settings/provider');
      }
    } catch (syncError) {
      alert.show({ title: desktopConnectionErrorMessage(syncError, t) });
    }
  }, [alert, importSelected, loadedPreview, router, selectedProviderIds, setupIntent, t, toast]);

  return (
    <SettingsScrollPage
      contentClassName="flex-grow gap-4"
      headerProps={{ title: t('settings.provider.desktopSync.title') }}
    >
      {setupIntent === 'chat' ? (
        <Text className="px-3 text-xs text-muted-foreground">
          {t('onboarding.step', { current: 2 })}
        </Text>
      ) : null}
      {isLoading ? (
        <ContentState.Loading title={t('settings.provider.desktopSync.loadingDevices')} />
      ) : error ? (
        <ContentState.Error
          description={desktopConnectionErrorMessage(error, t)}
          primaryAction={{
            children: t('settings.provider.desktopSync.retry'),
            onPress: () => void refetch(),
          }}
          title={t('settings.provider.desktopSync.loadDevicesFailed')}
        />
      ) : availableConnections.length === 0 ? (
        <ContentState.Empty
          description={t(
            connectionId
              ? 'settings.provider.desktopSync.deviceUnavailableDescription'
              : 'settings.provider.desktopSync.noDeviceDescription',
          )}
          primaryAction={{
            children: t('settings.provider.desktopSync.openDeviceConnections'),
            onPress: openDeviceConnections,
          }}
          title={t(
            connectionId
              ? 'settings.provider.desktopSync.deviceUnavailable'
              : 'settings.provider.desktopSync.noDevice',
          )}
        />
      ) : (availableConnections.length === 1 && !loadedPreview && !previewError) ||
        (isPreviewing && !loadedPreview) ? (
        <ContentState.Loading title={t('settings.provider.desktopSync.fetching')} />
      ) : previewError ? (
        <ContentState.Error
          description={desktopConnectionErrorMessage(previewError, t)}
          primaryAction={{
            children: t('settings.provider.desktopSync.retry'),
            onPress: retryPreview,
          }}
          title={t('settings.provider.desktopSync.fetchFailed')}
        />
      ) : loadedPreview ? (
        <ProviderSelection
          loadedPreview={loadedPreview}
          selectedProviderIds={selectedProviderIds}
          isImporting={isImporting}
          isPreviewing={isPreviewing}
          onApply={() => void applySync()}
          onReload={retryPreview}
          onToggleProvider={toggleProvider}
        />
      ) : (
        <>
          <Section title={t('settings.provider.desktopSync.chooseDevice')}>
            {availableConnections.map((connection) => (
              <Section.RadioItem
                description={t('settings.deviceConnections.versionValue', {
                  version: connection.desktopVersion,
                })}
                key={connection.id}
                label={connection.name}
                onPress={() => setSelectedConnectionId(connection.id)}
                selected={selectedConnectionId === connection.id}
              />
            ))}
          </Section>
          <Button disabled={!selectedConnectionId} onPress={continueWithSelectedConnection}>
            {t('settings.provider.desktopSync.continue')}
          </Button>
        </>
      )}
      {setupIntent === 'chat' ? (
        <View className="min-h-12 items-center justify-center">
          <Button
            disabled={isImporting}
            onPress={() => router.dismissTo('/onboarding')}
            size="xs"
            variant="ghost"
          >
            {t('onboarding.device.chooseAnotherWay')}
          </Button>
        </View>
      ) : null}
    </SettingsScrollPage>
  );
}

function ProviderSelection({
  isImporting,
  isPreviewing,
  loadedPreview,
  onApply,
  onReload,
  onToggleProvider,
  selectedProviderIds,
}: {
  isImporting: boolean;
  isPreviewing: boolean;
  loadedPreview: LoadedPreview;
  onApply: () => void;
  onReload: () => void;
  onToggleProvider: (providerId: string) => void;
  selectedProviderIds: ReadonlySet<string>;
}) {
  const { t } = useTranslation();

  if (loadedPreview.preview.providers.length === 0) {
    return (
      <ContentState.Empty
        description={t('settings.provider.desktopSync.emptyDescription')}
        primaryAction={{
          children: t('settings.provider.desktopSync.retry'),
          loading: isPreviewing,
          onPress: onReload,
        }}
        title={t('settings.provider.desktopSync.empty')}
      />
    );
  }

  return (
    <>
      <Text className="px-3 text-sm text-muted-foreground">
        {t('settings.provider.desktopSync.source', {
          name: loadedPreview.connection.name,
        })}
      </Text>
      <Section>
        {loadedPreview.preview.providers.map((provider) => {
          const isUnavailable = Boolean(provider.unavailableReason);
          const isSelected = selectedProviderIds.has(provider.id);
          return (
            <Section.Item
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected, disabled: isUnavailable }}
              description={
                provider.unavailableReason
                  ? t('settings.provider.desktopSync.unsupportedAuth')
                  : t('settings.provider.desktopSync.providerDescription', {
                      count: provider.models.length,
                    })
              }
              disabled={isUnavailable}
              key={provider.id}
              label={provider.name}
              leading={<ProviderAvatar providerId={provider.id} providerName={provider.name} />}
              onPress={isUnavailable ? undefined : () => onToggleProvider(provider.id)}
              showChevron={false}
              trailing={isUnavailable ? undefined : <SelectionIndicator selected={isSelected} />}
            />
          );
        })}
      </Section>
      <View className="gap-3">
        <Text className="px-3 text-center text-xs text-muted-foreground">
          {t('settings.provider.desktopSync.credentialsNotice')}
        </Text>
        <Button disabled={selectedProviderIds.size === 0} loading={isImporting} onPress={onApply}>
          {t('settings.provider.desktopSync.apply', { count: selectedProviderIds.size })}
        </Button>
      </View>
    </>
  );
}
