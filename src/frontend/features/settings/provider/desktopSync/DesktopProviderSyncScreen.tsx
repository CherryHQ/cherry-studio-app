import {
  Button,
  ContentState,
  Section,
  SelectionIndicator,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { useDesktopConnections } from '@/frontend/hooks/useDesktopConnections';
import type { DesktopImportPreview } from '@/shared/data/api/schemas/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

import { SettingsScrollPage } from '../../components/SettingsScrollPage';
import { desktopConnectionErrorMessage } from '../../desktopConnectionError';
import { ProviderAvatar } from '../components/ProviderAvatar';
import { useDesktopProviderSync } from './hooks/useDesktopProviderSync';

type LoadedPreview = {
  connection: DesktopConnection;
  preview: DesktopImportPreview;
};

export default function DesktopProviderSyncScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { toast } = useToast();
  const { connections, error, isLoading, refetch } = useDesktopConnections();
  const { importSelected, isImporting, isPreviewing, preview } = useDesktopProviderSync();
  const availableConnections = useMemo(
    () => connections.filter((connection) => connection.status === 'paired'),
    [connections],
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
  }, [availableConnections, isLoading, loadPreview, loadedPreview, previewError]);

  const openDeviceConnections = useCallback(() => {
    router.push('/settings/device-connections');
  }, [router]);
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
      toast.show({
        label: t('settings.provider.desktopSync.success', {
          models: result.modelsAdded + result.modelsUpdated,
          providers: result.providersAdded + result.providersUpdated,
        }),
        variant: 'success',
      });
      router.dismissTo('/settings/provider');
    } catch (syncError) {
      alert.show({ title: desktopConnectionErrorMessage(syncError, t) });
    }
  }, [alert, importSelected, loadedPreview, router, selectedProviderIds, t, toast]);

  return (
    <SettingsScrollPage
      contentClassName="flex-grow gap-6"
      headerProps={{ title: t('settings.provider.desktopSync.title') }}
    >
      {isLoading ? (
        <ContentState.Loading title={t('settings.provider.desktopSync.loadingDevices')} />
      ) : error ? (
        <ContentState.Error
          description={error.message}
          primaryAction={{
            children: t('settings.provider.desktopSync.retry'),
            onPress: () => void refetch(),
          }}
          title={t('settings.provider.desktopSync.loadDevicesFailed')}
        />
      ) : availableConnections.length === 0 ? (
        <ContentState.Empty
          description={t('settings.provider.desktopSync.noDeviceDescription')}
          layout="page"
          primaryAction={{
            children: t('settings.provider.desktopSync.openDeviceConnections'),
            onPress: openDeviceConnections,
          }}
          title={t('settings.provider.desktopSync.noDevice')}
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
          onApply={() => void applySync()}
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
    </SettingsScrollPage>
  );
}

function ProviderSelection({
  isImporting,
  loadedPreview,
  onApply,
  onToggleProvider,
  selectedProviderIds,
}: {
  isImporting: boolean;
  loadedPreview: LoadedPreview;
  onApply: () => void;
  onToggleProvider: (providerId: string) => void;
  selectedProviderIds: ReadonlySet<string>;
}) {
  const { t } = useTranslation();

  if (loadedPreview.preview.providers.length === 0) {
    return (
      <ContentState.Empty
        description={t('settings.provider.desktopSync.emptyDescription')}
        layout="page"
        title={t('settings.provider.desktopSync.empty')}
      />
    );
  }

  return (
    <>
      <Section
        footer={t('settings.provider.desktopSync.notice')}
        title={t('settings.provider.desktopSync.source', {
          name: loadedPreview.connection.name,
        })}
      >
        {loadedPreview.preview.providers.map((provider) => {
          const isUnavailable = Boolean(provider.unavailableReason);
          const isSelected = selectedProviderIds.has(provider.id);
          return (
            <Section.Item
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected, disabled: isUnavailable }}
              description={
                isUnavailable
                  ? t('settings.provider.desktopSync.unsupportedAuth')
                  : t('settings.provider.desktopSync.providerDescription', {
                      action: t(`settings.provider.desktopSync.action.${provider.action}`),
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
      <Button disabled={selectedProviderIds.size === 0} loading={isImporting} onPress={onApply}>
        {t('settings.provider.desktopSync.apply', { count: selectedProviderIds.size })}
      </Button>
      <Text className="px-3 text-sm text-muted-foreground">
        {t('settings.provider.desktopSync.credentialsNotice')}
      </Text>
    </>
  );
}
