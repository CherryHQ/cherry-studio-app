import { Button, ContentState, Section } from '@cherrystudio/ui/components';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { useDesktopConnections } from '@/frontend/hooks/useDesktopConnections';

export function OnboardingDeviceConnectionsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { connections, error, isLoading, refetch } = useDesktopConnections();

  // Picking a saved desktop is the only choice this screen offers. A first run has none, so it
  // sends those straight to the scanner, which carries the pairing instructions itself.
  if (!isLoading && !error && connections.length === 0) {
    return <Redirect href="/onboarding/device-connections/scan" />;
  }

  return (
    <>
      <RouteHeader
        onBack={() => router.replace('/onboarding')}
        title={t('onboarding.device.title')}
      />
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerClassName="flex-grow gap-8 px-6 py-6"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-3">
          <Text className="text-xs text-muted-foreground">
            {t('onboarding.step', { current: 1 })}
          </Text>
          <Text accessibilityRole="header" className="font-semibold text-2xl text-foreground">
            {t('onboarding.device.heading')}
          </Text>
          <Text className="text-base text-muted-foreground">
            {t('onboarding.device.description')}
          </Text>
        </View>

        {isLoading ? (
          <ContentState.Loading title={t('settings.deviceConnections.loading')} />
        ) : error ? (
          <ContentState.Error
            primaryAction={{ children: t('common.retry'), onPress: () => void refetch() }}
            title={t('settings.deviceConnections.loadFailed')}
          />
        ) : (
          <Section title={t('onboarding.device.saved')}>
            {connections.map((connection) => {
              const canSync =
                connection.status === 'paired' && connection.capabilities.includes('configuration');
              return (
                <Section.Item
                  description={t(
                    canSync
                      ? 'onboarding.device.continueSync'
                      : connection.status === 'needs-repair'
                        ? 'settings.deviceConnections.status.needs-repair'
                        : 'settings.provider.desktopSync.deviceUnavailable',
                  )}
                  disabled={connection.status === 'paired' && !canSync}
                  key={connection.id}
                  label={connection.name}
                  onPress={() =>
                    router.replace(
                      canSync
                        ? {
                            params: { connectionId: connection.id },
                            pathname: '/onboarding/provider-sync',
                          }
                        : {
                            params: { connectionId: connection.id },
                            pathname: '/onboarding/device-connections/scan',
                          },
                    )
                  }
                />
              );
            })}
          </Section>
        )}

        <View className="flex-grow justify-end gap-3">
          <Button
            onPress={() => router.replace('/onboarding/device-connections/scan')}
            size="lg"
            testID="onboarding-device-scan"
          >
            {t('onboarding.device.scan')}
          </Button>
          <Button onPress={() => router.replace('/onboarding')} variant="ghost">
            {t('onboarding.device.chooseAnotherWay')}
          </Button>
        </View>
      </ScrollView>
    </>
  );
}
