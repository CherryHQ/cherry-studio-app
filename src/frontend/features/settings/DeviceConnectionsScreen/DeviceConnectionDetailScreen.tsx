import { ContentState, Section, useAlert } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { remoteChatHref } from '@/frontend/appShell/navigation/chat';
import { useUuRemoteAction } from '@/frontend/appShell/uuRemote';
import { queryKeys, useBackendModule } from '@/frontend/data';
import { useDesktopConnectionLiveStatus } from '@/frontend/hooks/useDesktopConnectionLiveStatus';
import {
  useDesktopConnection,
  useDesktopConnectionActions,
} from '@/frontend/hooks/useDesktopConnections';
import type { DesktopLiveStatus } from '@/shared/contracts/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { describeCapabilities } from '../describeCapabilities';
import { desktopConnectionErrorMessage, formatConnectionFailures } from '../desktopConnectionError';
import { DesktopAvatar } from './components/DesktopAvatar';

export function DeviceConnectionDetailScreen() {
  const { connectionId } = useLocalSearchParams<{ connectionId?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { connection, error, isLoading, refetch } = useDesktopConnection(connectionId);
  const { disconnect, reconnect, isRemoving, remove } = useDesktopConnectionActions();
  const liveStatus = useDesktopConnectionLiveStatus(connectionId);

  const requestRemove = useCallback(() => {
    if (!connectionId || !connection) {
      return;
    }
    alert.confirm({
      confirmLabel: t('common.remove'),
      description: t('settings.deviceConnections.remove.message', {
        name: connection.profileName || connection.name,
      }),
      onConfirm: () => {
        void remove(connectionId)
          .then((removed) => {
            if (removed) router.dismissTo('/settings/device-connections');
          })
          .catch((removeError) => {
            alert.show({ title: desktopConnectionErrorMessage(removeError, t) });
          });
      },
      role: 'destructive',
      title: t('settings.deviceConnections.remove.title'),
    });
  }, [alert, connection, connectionId, remove, router, t]);

  if (isLoading) {
    return (
      <StateScreen title={t('settings.deviceConnections.title')}>
        <ContentState.Loading title={t('settings.deviceConnections.loading')} />
      </StateScreen>
    );
  }
  if (error || !connection) {
    return (
      <StateScreen title={t('settings.deviceConnections.title')}>
        <ContentState.Error
          description={error?.message}
          primaryAction={{
            children: t('settings.deviceConnections.retry'),
            onPress: () => void refetch(),
          }}
          title={t('settings.deviceConnections.loadFailed')}
        />
      </StateScreen>
    );
  }

  const displayName = connection.profileName || connection.name;
  const isConnected = liveStatus.state === 'connected';
  const offlineDescription = isConnected
    ? undefined
    : t('settings.deviceConnections.offlineNotice', {
        defaultValue: 'Computer is offline. Connect to use remote features.',
      });

  return (
    <SettingsScrollPage contentClassName="gap-6" headerProps={{ title: displayName }}>
      <View className="items-center gap-3 py-4">
        <DesktopAvatar avatar={connection.profileAvatar} name={displayName} size={64} />
        <View className="items-center gap-1">
          <Text className="font-semibold text-xl text-foreground">{displayName}</Text>
          {connection.profileName && connection.profileName !== connection.name ? (
            <Text className="text-muted-foreground text-sm">{connection.name}</Text>
          ) : null}
        </View>
        <LiveStatusBadge durableStatus={connection.status} liveStatus={liveStatus} />
      </View>

      <Section>
        {liveStatus.state === 'connected' ? (
          <Section.Item
            label={t('settings.deviceConnections.actions.disconnect', {
              defaultValue: 'Disconnect',
            })}
            onPress={() => disconnect(connection.id)}
            showChevron={false}
          />
        ) : liveStatus.state === 'disconnected' ? (
          <Section.Item
            label={t('settings.deviceConnections.actions.reconnect', {
              defaultValue: 'Reconnect',
            })}
            onPress={() => reconnect(connection.id)}
            showChevron={false}
          />
        ) : liveStatus.state === 'needs-repair' || connection.status === 'needs-repair' ? (
          <Section.Item
            label={t('settings.deviceConnections.actions.repair', {
              defaultValue: 'Re-pair Computer',
            })}
            onPress={() =>
              router.replace({
                params: { connectionId: connection.id },
                pathname: '/settings/device-connections/scan',
              })
            }
            showChevron
          />
        ) : (
          <Section.Item
            disabled={liveStatus.state === 'connecting'}
            label={t('settings.deviceConnections.actions.retry', {
              defaultValue: 'Retry Connection',
            })}
            onPress={() => reconnect(connection.id)}
            showChevron={false}
          />
        )}
      </Section>

      {liveStatus.state === 'unreachable' && liveStatus.failures?.length ? (
        <Section
          title={t('settings.deviceConnections.diagnostics.title', {
            defaultValue: 'Diagnostic Details',
          })}
        >
          <View className="rounded-xl bg-secondary/50 px-4 py-3">
            <Text className="font-mono text-muted-foreground text-xs">
              {formatConnectionFailures(liveStatus.failures, t)}
            </Text>
          </View>
        </Section>
      ) : null}

      <Section footer={t('settings.deviceConnections.localNetworkNotice')}>
        <Section.Item
          label={t('settings.deviceConnections.capabilities.label')}
          trailing={
            <Text className="text-muted-foreground">
              {describeCapabilities(connection.capabilities, t)}
            </Text>
          }
        />
        <Section.Item
          label={t('settings.deviceConnections.statusLabel')}
          trailing={
            <Text
              className={
                connection.status === 'paired'
                  ? 'text-success-subtle-foreground'
                  : 'text-destructive'
              }
            >
              {t(`settings.deviceConnections.status.${connection.status}`)}
            </Text>
          }
        />
      </Section>

      {connection.status === 'paired' && connection.capabilities.length > 0 ? (
        <Section>
          {connection.capabilities.includes('agent') ? (
            <Section.Item
              description={offlineDescription}
              disabled={!isConnected}
              label={t('settings.deviceConnections.openHome')}
              onPress={() => router.replace(remoteChatHref({ connectionId: connection.id }))}
            />
          ) : null}
          {connection.capabilities.includes('configuration') ? (
            <Section.Item
              description={
                offlineDescription ?? t('settings.deviceConnections.syncGuide.entryDescription')
              }
              disabled={!isConnected}
              label={t('settings.deviceConnections.syncGuide.entry')}
              onPress={() =>
                router.replace({
                  params: { connectionId: connection.id },
                  pathname: '/settings/provider/desktop-sync',
                })
              }
            />
          ) : null}
        </Section>
      ) : null}

      <Section>
        <UuRemoteBindingItem connectionId={connection.id} />
      </Section>

      <Section>
        <Section.Item
          label={t('settings.deviceConnections.location.scan')}
          onPress={() =>
            router.replace({
              params: { connectionId: connection.id },
              pathname: '/settings/device-connections/scan',
            })
          }
        />
      </Section>

      <Section>
        <Section.Item
          destructive
          disabled={isRemoving}
          label={t('settings.deviceConnections.remove.action')}
          onPress={requestRemove}
          showChevron={false}
        />
      </Section>
    </SettingsScrollPage>
  );
}

function LiveStatusBadge({
  liveStatus,
  durableStatus,
}: {
  liveStatus: DesktopLiveStatus;
  durableStatus: DesktopConnection['status'];
}) {
  const { t } = useTranslation();
  let statusLabel: string;
  let statusTone: 'danger' | 'default' | 'success';

  if (durableStatus === 'needs-repair' || liveStatus.state === 'needs-repair') {
    statusLabel = t('settings.deviceConnections.liveStatus.needsRepair', {
      defaultValue: t('settings.deviceConnections.status.needs-repair', {
        defaultValue: 'Needs Repair',
      }),
    });
    statusTone = 'danger';
  } else {
    switch (liveStatus.state) {
      case 'connected':
        statusLabel = t('settings.deviceConnections.liveStatus.connected', {
          defaultValue: 'Connected',
        });
        statusTone = 'success';
        break;
      case 'connecting':
        statusLabel = t('settings.deviceConnections.liveStatus.connecting', {
          defaultValue: 'Connecting...',
        });
        statusTone = 'default';
        break;
      case 'reconnecting':
        statusLabel = t('settings.deviceConnections.liveStatus.reconnecting', {
          defaultValue: 'Reconnecting...',
        });
        statusTone = 'default';
        break;
      case 'disconnected':
        statusLabel = t('settings.deviceConnections.liveStatus.disconnected', {
          defaultValue: 'Disconnected',
        });
        statusTone = 'default';
        break;
      case 'unsupported':
        statusLabel = t('settings.deviceConnections.liveStatus.unsupported', {
          defaultValue: 'Unsupported',
        });
        statusTone = 'danger';
        break;
      case 'unreachable':
      default:
        statusLabel = t('settings.deviceConnections.liveStatus.unreachable', {
          defaultValue: 'Offline',
        });
        statusTone = 'default';
        break;
    }
  }

  return (
    <View
      className={cn(
        'items-center justify-center rounded-lg border px-2 py-0.5',
        statusTone === 'success'
          ? 'border-success-border bg-success-subtle'
          : statusTone === 'danger'
            ? 'border-destructive/30 bg-destructive/10'
            : 'border-border bg-secondary',
      )}
    >
      <Text
        className={cn(
          'font-medium text-xs',
          statusTone === 'success'
            ? 'text-success-subtle-foreground'
            : statusTone === 'danger'
              ? 'text-destructive'
              : 'text-muted-foreground',
        )}
      >
        {statusLabel}
      </Text>
    </View>
  );
}

function UuRemoteBindingItem({ connectionId }: { connectionId: string }) {
  const { t } = useTranslation();
  const uuRemote = useBackendModule('uuRemote');
  const remoteDesktop = useUuRemoteAction();
  const binding = useQuery({
    queryKey: queryKeys.uuRemote.binding(connectionId),
    queryFn: () => uuRemote.getBinding(connectionId),
  });
  const status = binding.isPending
    ? t('uuRemote.binding.loading')
    : binding.isError
      ? t('uuRemote.binding.loadFailed')
      : binding.data
        ? t('uuRemote.binding.linked', { id: binding.data.displayId })
        : t('uuRemote.binding.notLinked');

  return (
    <Section.Item
      label={t('uuRemote.bind.title')}
      accessibilityValue={{ text: status }}
      disabled={remoteDesktop.isOpening}
      onPress={() => remoteDesktop.bind({ page: 'device', connectionId })}
      showChevron
      trailing={
        <Text className="text-muted-foreground" numberOfLines={1}>
          {status}
        </Text>
      }
    />
  );
}

function StateScreen({ children, title }: { children: ReactNode; title: string }) {
  return (
    <>
      <RouteHeader title={title} />
      <View className="flex-1 justify-center px-6">{children}</View>
    </>
  );
}
