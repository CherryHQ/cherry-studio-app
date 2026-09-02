import { Button, ContentState, Section, useAlert } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/components/headers';
import {
  useDesktopConnection,
  useDesktopConnectionActions,
} from '@/frontend/hooks/useDesktopConnections';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
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
          .then(() => router.dismissTo('/settings/device-connections'))
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
          label={t('settings.deviceConnections.version')}
          trailing={<Text className="text-muted-foreground">{connection.desktopVersion}</Text>}
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

      <Button
        onPress={() =>
          router.push({
            params: { connectionId: connection.id },
            pathname: '/settings/device-connections/scan',
          })
        }
        variant={connection.status === 'paired' ? 'outline' : 'default'}
      >
        {t('settings.deviceConnections.repair')}
      </Button>

      <Button loading={isRemoving} onPress={requestRemove} variant="destructive">
        {t('settings.deviceConnections.remove.action')}
      </Button>
    </SettingsScrollPage>
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
