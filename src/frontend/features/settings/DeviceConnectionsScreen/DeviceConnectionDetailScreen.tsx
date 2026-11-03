import { ContentState, Section, useAlert } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { remoteChatHref } from '@/frontend/appShell/navigation/chat';
import { useUuRemoteAction } from '@/frontend/appShell/uuRemote';
import { queryKeys, useBackendModule } from '@/frontend/data';
import {
  useDesktopConnection,
  useDesktopConnectionActions,
} from '@/frontend/hooks/useDesktopConnections';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { describeCapabilities } from '../describeCapabilities';
import { desktopConnectionErrorMessage } from '../desktopConnectionError';

export function DeviceConnectionDetailScreen() {
  const { connectionId } = useLocalSearchParams<{ connectionId?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { connection, error, isLoading, refetch } = useDesktopConnection(connectionId);
  const { isRemoving, remove } = useDesktopConnectionActions();

  const requestRemove = useCallback(() => {
    if (!connectionId || !connection) {
      return;
    }
    alert.confirm({
      confirmLabel: t('common.remove'),
      description: t('settings.deviceConnections.remove.message', { name: connection.name }),
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

  return (
    <SettingsScrollPage contentClassName="gap-6" headerProps={{ title: connection.name }}>
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
              label={t('settings.deviceConnections.openHome')}
              onPress={() => router.replace(remoteChatHref({ connectionId: connection.id }))}
            />
          ) : null}
          {connection.capabilities.includes('configuration') ? (
            <Section.Item
              description={t('settings.deviceConnections.syncGuide.entryDescription')}
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
