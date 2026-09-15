import CircleCheckIcon from '@cherrystudio/app-icons/icons/circle-check';
import { Button, ContentState } from '@cherrystudio/ui/components';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { FirstUseSetupIntent } from '@/frontend/appShell/navigation';
import { useDesktopConnection } from '@/frontend/hooks/useDesktopConnections';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { desktopConnectionErrorMessage } from '../desktopConnectionError';

export function DeviceConnectionSyncGuideScreen({
  setupIntent,
}: { setupIntent?: FirstUseSetupIntent } = {}) {
  const params = useLocalSearchParams<{ connectionId?: string | string[] }>();
  const connectionId = getSingleRouteParam(params.connectionId);

  if (!connectionId) {
    return (
      <Redirect
        href={
          setupIntent === 'chat' ? '/onboarding/device-connections' : '/settings/device-connections'
        }
      />
    );
  }

  return (
    <DeviceConnectionSyncGuide
      connectionId={connectionId}
      key={connectionId}
      setupIntent={setupIntent}
    />
  );
}

function DeviceConnectionSyncGuide({
  connectionId,
  setupIntent,
}: {
  connectionId: string;
  setupIntent?: FirstUseSetupIntent;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { connection, error, isLoading, refetch } = useDesktopConnection(connectionId);

  return (
    <SettingsScrollPage
      contentClassName="flex-grow justify-between gap-8"
      headerProps={{ title: t('settings.deviceConnections.syncGuide.title') }}
    >
      {isLoading ? (
        <ContentState.Loading title={t('settings.deviceConnections.loading')} />
      ) : error || !connection ? (
        <ContentState.Error
          description={desktopConnectionErrorMessage(error, t)}
          primaryAction={{
            children: t('settings.deviceConnections.retry'),
            onPress: () => void refetch(),
          }}
          title={t('settings.deviceConnections.loadFailed')}
        />
      ) : connection.status !== 'paired' ? (
        <ContentState.Empty
          description={t('settings.deviceConnections.syncGuide.repairDescription')}
          primaryAction={{
            children: t('settings.deviceConnections.repair'),
            onPress: () =>
              router.replace({
                params: { connectionId },
                pathname:
                  setupIntent === 'chat'
                    ? '/onboarding/device-connections/scan'
                    : '/settings/device-connections/scan',
              }),
          }}
          title={t('settings.deviceConnections.status.needs-repair')}
        />
      ) : (
        <>
          <View className="flex-grow items-center justify-center gap-5 px-2 py-8">
            <CircleCheckIcon
              accessibilityElementsHidden
              className="size-10 text-success-subtle-foreground"
              importantForAccessibility="no"
            />
            <View className="gap-2">
              <Text
                accessibilityRole="header"
                className="text-center font-semibold text-2xl text-foreground"
              >
                {t('settings.deviceConnections.syncGuide.heading')}
              </Text>
              <Text className="text-center text-sm text-muted-foreground">{connection.name}</Text>
            </View>
          </View>

          <View className="gap-4">
            <Text className="text-center text-xs text-muted-foreground">
              {t('settings.deviceConnections.syncGuide.networkNotice')}
            </Text>
            <View className="gap-2">
              <Button
                onPress={() =>
                  router.push({
                    params: { connectionId },
                    pathname:
                      setupIntent === 'chat'
                        ? '/onboarding/provider-sync'
                        : '/settings/provider/desktop-sync',
                  })
                }
                size="lg"
              >
                {t('settings.deviceConnections.syncGuide.continue')}
              </Button>
              <View className="min-h-12 items-center justify-center">
                <Button
                  onPress={() =>
                    router.dismissTo(
                      setupIntent === 'chat' ? '/onboarding' : '/settings/device-connections',
                    )
                  }
                  size="xs"
                  variant="ghost"
                >
                  {t(
                    setupIntent === 'chat'
                      ? 'onboarding.device.chooseAnotherWay'
                      : 'settings.deviceConnections.syncGuide.later',
                  )}
                </Button>
              </View>
            </View>
          </View>
        </>
      )}
    </SettingsScrollPage>
  );
}
