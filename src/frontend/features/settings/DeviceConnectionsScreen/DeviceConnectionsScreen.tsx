import CameraIcon from '@cherrystudio/app-icons/icons/camera';
import NetworkIcon from '@cherrystudio/app-icons/icons/network';
import { ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { HeaderToolbarAction } from '@/frontend/components/headers';
import { useDesktopConnections } from '@/frontend/hooks/useDesktopConnections';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { SettingsServiceRow } from '../components/SettingsServiceRow';

export function DeviceConnectionsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { connections, error, isLoading, refetch } = useDesktopConnections();
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('settings.deviceConnections.scan.action'),
        icon: CameraIcon,
        key: 'scan-device',
        onPress: () => router.push('/settings/device-connections/scan'),
        type: 'icon',
      },
    ],
    [router, t],
  );

  return (
    <SettingsScrollPage
      contentClassName="flex-grow gap-6"
      headerProps={{ rightActions, title: t('settings.deviceConnections.title') }}
    >
      {isLoading ? (
        <ContentState.Loading title={t('settings.deviceConnections.loading')} />
      ) : error ? (
        <ContentState.Error
          description={error.message}
          primaryAction={{
            children: t('settings.deviceConnections.retry'),
            onPress: () => void refetch(),
          }}
          title={t('settings.deviceConnections.loadFailed')}
        />
      ) : connections.length === 0 ? (
        <ContentState.Empty
          description={t('settings.deviceConnections.emptyDescription')}
          icon={
            <ContentState.Icon>
              <NetworkIcon className="size-7 text-foreground" />
            </ContentState.Icon>
          }
          layout="page"
          primaryAction={{
            children: t('settings.deviceConnections.scan.action'),
            onPress: () => router.push('/settings/device-connections/scan'),
          }}
          title={t('settings.deviceConnections.empty')}
        />
      ) : (
        <View className="overflow-hidden rounded-2xl bg-grouped-surface">
          {connections.map((connection, index) => (
            <SettingsServiceRow
              id={connection.id}
              key={connection.id}
              name={connection.name}
              showSeparator={index > 0}
              statusLabel={t(`settings.deviceConnections.status.${connection.status}`)}
              statusTone={connection.status === 'paired' ? 'success' : 'danger'}
              subtitle={t('settings.deviceConnections.versionValue', {
                version: connection.desktopVersion,
              })}
              onPress={() =>
                router.push({
                  params: { connectionId: connection.id },
                  pathname: '/settings/device-connections/[connectionId]',
                })
              }
            />
          ))}
        </View>
      )}
    </SettingsScrollPage>
  );
}
