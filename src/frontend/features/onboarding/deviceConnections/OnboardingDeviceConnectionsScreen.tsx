import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useDesktopConnections } from '@/frontend/hooks/useDesktopConnections';

import {
  OnboardingButton,
  OnboardingMessage,
  OnboardingOption,
  OnboardingPage,
} from '../components/OnboardingPage';

export function OnboardingDeviceConnectionsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { connections, error, isLoading, refetch } = useDesktopConnections();
  if (!isLoading && !error && connections.length === 0)
    return <Redirect href="/onboarding/device-connections/scan" />;
  return (
    <OnboardingPage
      description={t('onboarding.device.description')}
      footer={
        <OnboardingButton
          onPress={() => router.replace('/onboarding/device-connections/scan')}
          testID="onboarding-device-scan"
        >
          {t('onboarding.device.scan')}
        </OnboardingButton>
      }
      onBack={() => router.replace('/onboarding')}
      step={{ current: 1, total: 3, label: t('onboarding.step', { current: 1 }) }}
      title={t('onboarding.device.heading')}
    >
      {isLoading ? (
        <OnboardingMessage loading>{t('settings.deviceConnections.loading')}</OnboardingMessage>
      ) : error ? (
        <View className="gap-3">
          <OnboardingMessage>{t('settings.deviceConnections.loadFailed')}</OnboardingMessage>
          <OnboardingButton onPress={() => void refetch()}>{t('common.retry')}</OnboardingButton>
        </View>
      ) : (
        <View className="gap-3">
          {connections.map((connection) => {
            const canSync =
              connection.status === 'paired' && connection.capabilities.includes('configuration');
            return (
              <OnboardingOption
                description={t(
                  canSync
                    ? 'onboarding.device.continueSync'
                    : connection.status === 'needs-repair'
                      ? 'settings.deviceConnections.status.needs-repair'
                      : 'settings.provider.desktopSync.deviceUnavailable',
                )}
                disabled={connection.status === 'paired' && !canSync}
                key={connection.id}
                onPress={() =>
                  router.replace({
                    pathname: canSync
                      ? '/onboarding/provider-sync'
                      : '/onboarding/device-connections/scan',
                    params: { connectionId: connection.id },
                  })
                }
                title={connection.name}
              />
            );
          })}
        </View>
      )}
    </OnboardingPage>
  );
}
