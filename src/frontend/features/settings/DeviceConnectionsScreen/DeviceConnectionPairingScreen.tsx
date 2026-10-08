import CheckIcon from '@cherrystudio/app-icons/icons/check';
import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import { Button, ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { FirstUseSetupIntent } from '@/frontend/appShell/navigation';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { desktopConnectionErrorMessage } from '../desktopConnectionError';
import { useDesktopPairingInput } from './DesktopPairingProvider';
import { useDesktopPairing } from './useDesktopPairing';

export function DeviceConnectionPairingScreen({
  setupIntent,
}: { setupIntent?: FirstUseSetupIntent } = {}) {
  const { input: pendingInput, setInput } = useDesktopPairingInput();
  const [input] = useState(pendingInput);
  const { connection, error, progress } = useDesktopPairing(input);
  const { t } = useTranslation();
  const router = useRouter();
  const current = progress.at(-1);

  useEffect(() => {
    setInput(null);
  }, [setInput]);

  const scanAgain = () =>
    router.replace({
      pathname:
        setupIntent === 'chat'
          ? '/onboarding/device-connections/scan'
          : '/settings/device-connections/scan',
      params: input?.connectionId ? { connectionId: input.connectionId } : {},
    });

  const finish = () => {
    if (!connection) return;
    if (setupIntent === 'chat' && connection.capabilities.includes('configuration')) {
      router.replace({
        pathname: '/onboarding/provider-sync',
        params: { connectionId: connection.id },
      });
    } else if (setupIntent === 'chat') {
      router.dismissTo('/onboarding');
    } else {
      router.replace({
        pathname: '/settings/device-connections/[connectionId]',
        params: { connectionId: connection.id },
      });
    }
  };

  return (
    <SettingsScrollPage
      contentClassName="flex-grow gap-8"
      headerProps={{ title: t('settings.deviceConnections.pairing.title') }}
    >
      {!input ? (
        <ContentState.Empty
          title={t('settings.deviceConnections.pairing.scanAgain')}
          primaryAction={{
            children: t('settings.deviceConnections.scan.action'),
            onPress: scanAgain,
          }}
        />
      ) : (
        <>
          <View className="gap-2">
            <Text className="text-2xl font-semibold text-foreground">{input.name}</Text>
            <Text accessibilityLiveRegion="polite" className="text-base text-muted-foreground">
              {connection
                ? t('settings.deviceConnections.pairing.complete')
                : error
                  ? t('settings.deviceConnections.pairing.failed')
                  : current?.stage === 'waiting'
                    ? t('settings.deviceConnections.scan.approveOnDesktop')
                    : t('settings.deviceConnections.pairing.inProgress')}
            </Text>
          </View>
          {current?.stage === 'waiting' && !error && (
            <View className="items-center gap-2 rounded-2xl bg-card p-6">
              <Text className="text-sm text-muted-foreground">
                {t('settings.deviceConnections.scan.verificationCode')}
              </Text>
              <Text
                accessibilityLabel={`${t('settings.deviceConnections.scan.verificationCode')}: ${current.claim.verificationCode.split('').join(' ')}`}
                className="font-mono text-3xl text-foreground"
                selectable
              >
                {current.claim.verificationCode}
              </Text>
            </View>
          )}
          <View className="gap-4">
            <Text accessibilityRole="header" className="text-sm font-medium text-muted-foreground">
              {t('settings.deviceConnections.pairing.progress')}
            </Text>
            {progress.map((event, index) => {
              const isComplete = Boolean(connection) || index < progress.length - 1;
              const hasFailed = Boolean(error) && !isComplete;
              return (
                <View className="flex-row items-start gap-3" key={event.stage}>
                  {isComplete ? (
                    <CheckIcon accessible={false} className="size-5 text-foreground" />
                  ) : hasFailed ? (
                    <CircleAlertIcon accessible={false} className="size-5 text-destructive" />
                  ) : (
                    <Text
                      accessible={false}
                      className="w-5 text-center text-sm text-muted-foreground"
                    >
                      {index + 1}
                    </Text>
                  )}
                  <View className="flex-1 gap-1">
                    <Text className="text-base text-foreground">
                      {t(`settings.deviceConnections.pairing.step.${event.stage}`)}
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {isComplete
                        ? t('common.done')
                        : hasFailed
                          ? t('settings.deviceConnections.pairing.failed')
                          : t('settings.deviceConnections.pairing.inProgress')}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
          {error ? (
            <ContentState.Error
              title={t('settings.deviceConnections.pairing.failed')}
              description={desktopConnectionErrorMessage(error, t)}
              primaryAction={{
                children: t('settings.deviceConnections.pairing.scanAgain'),
                onPress: scanAgain,
              }}
            />
          ) : connection ? (
            <Button onPress={finish}>{t('common.done')}</Button>
          ) : (
            <Button onPress={() => router.back()} variant="secondary">
              {t('common.cancel')}
            </Button>
          )}
        </>
      )}
    </SettingsScrollPage>
  );
}
