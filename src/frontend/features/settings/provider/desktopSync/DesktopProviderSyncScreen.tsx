import {
  Button,
  ContentState,
  Section,
  SelectionIndicator,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { type Href, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ProviderAvatar } from '@/frontend/components/Avatar';
import {
  useDesktopProviderSync,
  type DesktopProviderSyncPreview,
} from '@/frontend/hooks/useDesktopProviderSync';
import { readInternalHref } from '@/frontend/utils/internalHref';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { DesktopImportUnavailableReason } from '@/shared/data/api/schemas/desktopConnections';

import { SettingsScrollPage } from '../../components/SettingsScrollPage';
import { describeCapabilities } from '../../describeCapabilities';
import { desktopConnectionErrorMessage } from '../../desktopConnectionError';

// `keySeparator: false` makes the whole dotted key literal, so spell each state out.
const UNAVAILABLE_KEYS = {
  'missing-api-key': 'settings.provider.desktopSync.unavailable.missing-api-key',
  unreadable: 'settings.provider.desktopSync.unavailable.unreadable',
  'unsupported-auth': 'settings.provider.desktopSync.unavailable.unsupported-auth',
  'unsupported-endpoint': 'settings.provider.desktopSync.unavailable.unsupported-endpoint',
} as const satisfies Record<DesktopImportUnavailableReason, string>;

type LoadedPreview = DesktopProviderSyncPreview;

export default function DesktopProviderSyncScreen() {
  const params = useLocalSearchParams<{
    connectionId?: string | string[];
    returnTo?: string | string[];
  }>();
  const connectionId = getSingleRouteParam(params.connectionId);
  const returnTo = readInternalHref(params.returnTo) ?? '/settings/provider';

  return (
    <DesktopProviderSync
      connectionId={connectionId}
      returnTo={returnTo}
      key={connectionId ?? 'choose-device'}
    />
  );
}

function DesktopProviderSync({
  connectionId,
  returnTo,
}: {
  connectionId?: string;
  returnTo: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const sync = useDesktopProviderSync(connectionId);
  const {
    availableConnections,
    error,
    isLoading,
    refetch,
    loadedPreview,
    previewError,
    selectedProviderIds,
    isImporting,
    isPreviewing,
    loadPreview,
    retryPreview,
    toggleProvider,
  } = sync;
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>();

  const close = () => router.dismissTo(returnTo as Href);
  const openDeviceConnections = () => router.push('/settings/device-connections');
  const continueWithSelectedConnection = () => {
    const connection = availableConnections.find((item) => item.id === selectedConnectionId);
    if (connection) void loadPreview(connection);
  };
  const applySync = async () => {
    if (!loadedPreview || selectedProviderIds.size === 0) {
      return;
    }

    try {
      const result = await sync.apply();
      if (!result || !navigation.isFocused()) return;
      toast.show({
        label: t('settings.provider.desktopSync.success', {
          models: result.modelsAdded,
          providers: result.providersAdded,
          modelsSkipped: result.modelsSkipped,
          providersUpdated: result.providersUpdated,
        }),
        variant: 'success',
      });
      close();
    } catch (syncError) {
      alert.show({ title: desktopConnectionErrorMessage(syncError, t) });
    }
  };

  return (
    <SettingsScrollPage
      contentClassName="flex-grow gap-4"
      headerProps={{
        onBack: close,
        title: t('settings.provider.desktopSync.title'),
      }}
    >
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
                description={describeCapabilities(connection.capabilities, t)}
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
          const isDisabled = isUnavailable || isImporting;
          const isSelected = selectedProviderIds.has(provider.id);
          return (
            <Section.Item
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected, disabled: isDisabled }}
              description={
                provider.unavailableReason
                  ? t(UNAVAILABLE_KEYS[provider.unavailableReason])
                  : (provider.accountNotice
                      ? t('settings.provider.desktopSync.accountNotice') + '\n'
                      : '') +
                    t('settings.provider.desktopSync.providerDescription', {
                      count: provider.models.length,
                    })
              }
              disabled={isDisabled}
              key={provider.id}
              label={provider.name}
              leading={<ProviderAvatar providerId={provider.id} providerName={provider.name} />}
              onPress={isUnavailable ? undefined : () => onToggleProvider(provider.id)}
              showChevron={false}
              trailing={
                isUnavailable ? undefined : (
                  <SelectionIndicator disabled={isDisabled} selected={isSelected} />
                )
              }
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
