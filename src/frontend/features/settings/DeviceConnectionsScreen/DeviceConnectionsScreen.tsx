import CameraIcon from '@cherrystudio/app-icons/icons/camera';
import NetworkIcon from '@cherrystudio/app-icons/icons/network';
import { ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { HeaderToolbarAction } from '@/frontend/appShell/header';
import { useDesktopConnectionLiveStatus } from '@/frontend/hooks/useDesktopConnectionLiveStatus';
import { useDesktopConnections } from '@/frontend/hooks/useDesktopConnections';
import type { DesktopLiveStatus } from '@/shared/contracts/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { SettingsServiceRow } from '../components/SettingsServiceRow';
import { describeCapabilities } from '../describeCapabilities';
import { DesktopAvatar } from './components/DesktopAvatar';

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
        nativeIcon: require('@/assets/header-toolbar/camera.png'),
        onPress: () => router.replace('/settings/device-connections/scan'),
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
          primaryAction={{
            children: t('settings.deviceConnections.scan.action'),
            onPress: () => router.replace('/settings/device-connections/scan'),
          }}
          title={t('settings.deviceConnections.empty')}
        />
      ) : (
        <View className="overflow-hidden rounded-2xl bg-card" style={styles.card}>
          {connections.map((connection, index) => (
            <DeviceConnectionRow
              connection={connection}
              key={connection.id}
              showSeparator={index > 0}
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

function DeviceConnectionRow({
  connection,
  showSeparator,
  onPress,
}: {
  connection: DesktopConnection;
  showSeparator: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const liveStatus = useDesktopConnectionLiveStatus(connection.id);

  const displayName = connection.profileName || connection.name;
  const capabilitiesText = describeCapabilities(connection.capabilities, t);
  const subtitle =
    connection.profileName && connection.profileName !== connection.name
      ? `${connection.name} • ${capabilitiesText}`
      : capabilitiesText;

  const { statusLabel, statusTone } = getLiveStatusDisplay(liveStatus, connection.status, t);

  return (
    <SettingsServiceRow
      avatar={<DesktopAvatar avatar={connection.profileAvatar} name={displayName} size={36} />}
      id={connection.id}
      name={displayName}
      showSeparator={showSeparator}
      statusLabel={statusLabel}
      statusTone={statusTone}
      subtitle={subtitle}
      onPress={onPress}
    />
  );
}

function getLiveStatusDisplay(
  liveStatus: DesktopLiveStatus,
  durableStatus: DesktopConnection['status'],
  t: TFunction,
): { statusLabel: string; statusTone: 'danger' | 'default' | 'success' } {
  if (durableStatus === 'needs-repair' || liveStatus.state === 'needs-repair') {
    return {
      statusLabel: t('settings.deviceConnections.liveStatus.needsRepair', {
        defaultValue: t('settings.deviceConnections.status.needs-repair', {
          defaultValue: 'Needs Repair',
        }),
      }),
      statusTone: 'danger',
    };
  }

  switch (liveStatus.state) {
    case 'connected':
      return {
        statusLabel: t('settings.deviceConnections.liveStatus.connected', {
          defaultValue: 'Connected',
        }),
        statusTone: 'success',
      };
    case 'connecting':
      return {
        statusLabel: t('settings.deviceConnections.liveStatus.connecting', {
          defaultValue: 'Connecting...',
        }),
        statusTone: 'default',
      };
    case 'reconnecting':
      return {
        statusLabel: t('settings.deviceConnections.liveStatus.reconnecting', {
          defaultValue: 'Reconnecting...',
        }),
        statusTone: 'default',
      };
    case 'disconnected':
      return {
        statusLabel: t('settings.deviceConnections.liveStatus.disconnected', {
          defaultValue: 'Disconnected',
        }),
        statusTone: 'default',
      };
    case 'unsupported':
      return {
        statusLabel: t('settings.deviceConnections.liveStatus.unsupported', {
          defaultValue: 'Unsupported',
        }),
        statusTone: 'danger',
      };
    case 'unreachable':
    default:
      return {
        statusLabel: t('settings.deviceConnections.liveStatus.unreachable', {
          defaultValue: 'Offline',
        }),
        statusTone: 'default',
      };
  }
}

const styles = StyleSheet.create({
  card: {
    borderCurve: 'continuous',
  },
});
