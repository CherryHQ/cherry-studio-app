import { Button, ContentState, Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { useDesktopConnections } from '@/frontend/hooks/useDesktopConnections';

export function OnboardingDeviceConnectionsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { connections, error, isLoading, refetch } = useDesktopConnections();

  return (
    <>
      <RouteHeader title={t('onboarding.device.title')} />
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
        ) : connections.length > 0 ? (
          <Section title={t('onboarding.device.saved')}>
            {connections.map((connection) => (
              <Section.Item
                description={t(
                  connection.status === 'paired'
                    ? 'onboarding.device.continueSync'
                    : 'settings.deviceConnections.status.needs-repair',
                )}
                key={connection.id}
                label={connection.name}
                onPress={() =>
                  router.push({
                    params: { connectionId: connection.id },
                    pathname:
                      connection.status === 'paired'
                        ? '/onboarding/device-connections/sync-guide'
                        : '/onboarding/device-connections/scan',
                  })
                }
              />
            ))}
          </Section>
        ) : null}

        <View className="gap-6">
          <View className="gap-2">
            <Text className="font-medium text-base text-foreground">
              {t('onboarding.device.networkTitle')}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {t('onboarding.device.networkDescription')}
            </Text>
          </View>
          <View className="gap-2">
            <Text className="font-medium text-base text-foreground">
              {t('onboarding.device.qrTitle')}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {t('onboarding.device.qrDescription')}
            </Text>
          </View>
        </View>

        <View className="flex-grow justify-end gap-3">
          <Button
            onPress={() => router.push('/onboarding/device-connections/scan')}
            size="lg"
            testID="onboarding-device-scan"
          >
            {t('onboarding.device.scan')}
          </Button>
          <Button onPress={() => router.dismissTo('/onboarding')} variant="ghost">
            {t('onboarding.device.chooseAnotherWay')}
          </Button>
        </View>
      </ScrollView>
    </>
  );
}
