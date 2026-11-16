import CheckIcon from '@cherrystudio/app-icons/icons/check';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { DesktopPairingProgress } from '@/shared/contracts';

import { OnboardingButton, OnboardingMessage, OnboardingPage } from '../components/OnboardingPage';

export function OnboardingPairingScreen({
  complete,
  error,
  name,
  onBack,
  onFinish,
  onScanAgain,
  progress,
}: {
  complete: boolean;
  error?: string;
  name?: string;
  onBack: () => void;
  onFinish: () => void;
  onScanAgain: () => void;
  progress: readonly DesktopPairingProgress[];
}) {
  const { t } = useTranslation();
  const current = progress.at(-1);
  return (
    <OnboardingPage
      description={name}
      footer={
        <OnboardingButton onPress={complete ? onFinish : error || !name ? onScanAgain : onBack}>
          {t(
            complete
              ? 'onboarding.continue'
              : error || !name
                ? 'settings.deviceConnections.pairing.scanAgain'
                : 'common.cancel',
          )}
        </OnboardingButton>
      }
      onBack={onBack}
      step={{ current: 1, total: 3, label: t('onboarding.step', { current: 1 }) }}
      testID="onboarding-desktop-pair"
      title={t('settings.deviceConnections.pairing.title')}
    >
      {error ? (
        <OnboardingMessage>{error}</OnboardingMessage>
      ) : complete ? (
        <OnboardingMessage>{t('settings.deviceConnections.pairing.complete')}</OnboardingMessage>
      ) : current?.stage === 'waiting' ? (
        <View className="gap-4 rounded-2xl bg-card p-6">
          <Text className="text-base text-foreground">
            {t('settings.deviceConnections.scan.approveOnDesktop')}
          </Text>
          <Text
            accessibilityLabel={`${t('settings.deviceConnections.scan.verificationCode')}: ${current.claim.verificationCode.split('').join(' ')}`}
            className="font-mono text-3xl text-foreground"
            selectable
          >
            {current.claim.verificationCode}
          </Text>
        </View>
      ) : (
        <OnboardingMessage loading>
          {t('settings.deviceConnections.pairing.inProgress')}
        </OnboardingMessage>
      )}
      <View className="gap-5">
        {progress.map((event, index) => (
          <View className="flex-row items-center gap-4" key={event.stage}>
            {complete || index < progress.length - 1 ? (
              <CheckIcon className="size-5 text-foreground" />
            ) : (
              <Text className="w-5 text-center text-sm text-muted-foreground">{index + 1}</Text>
            )}
            <Text className="flex-1 text-base text-foreground">
              {t(`settings.deviceConnections.pairing.step.${event.stage}`)}
            </Text>
          </View>
        ))}
      </View>
    </OnboardingPage>
  );
}
