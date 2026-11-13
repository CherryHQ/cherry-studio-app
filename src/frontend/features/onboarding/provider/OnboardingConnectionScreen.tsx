import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ProviderConfigurationValue } from '@/frontend/types/providerConfiguration';

import { OnboardingButton, OnboardingMessage, OnboardingPage } from '../components/OnboardingPage';

/** Keep only first-use framing; the route mounts the original provider configuration body. */
export function OnboardingConnectionScreen({
  canContinue,
  children,
  continueHint,
  isError,
  isSaving,
  onBack,
  onContinue,
  value,
}: {
  canContinue: boolean;
  children: ReactNode;
  continueHint?: string;
  isError?: boolean;
  isSaving: boolean;
  onBack?: () => void;
  onContinue: () => void;
  value?: ProviderConfigurationValue;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const back = onBack ?? (() => router.replace('/onboarding/provider'));
  return (
    <OnboardingPage
      description={t('onboarding.connection.description')}
      footer={
        <>
          {continueHint ? (
            <Text className="text-center text-xs text-muted-foreground">{continueHint}</Text>
          ) : null}
          <OnboardingButton
            disabled={!canContinue || Boolean(value?.isBusy)}
            loading={isSaving}
            onPress={onContinue}
            testID="provider-continue"
          >
            {t('onboarding.continue')}
          </OnboardingButton>
        </>
      }
      onBack={isSaving ? undefined : back}
      step={{ current: 2, total: 3, label: t('onboarding.step', { current: 2 }) }}
      testID="onboarding-connection"
      title={
        value?.name
          ? t('settings.provider.setup.title', { name: value.name })
          : t('settings.provider.add.title')
      }
      variant="content"
    >
      {isError ? (
        <View className="gap-3 px-6">
          <OnboardingMessage>{t('settings.provider.setup.loadFailed')}</OnboardingMessage>
          <OnboardingButton onPress={back}>{t('common.back')}</OnboardingButton>
        </View>
      ) : (
        children
      )}
    </OnboardingPage>
  );
}
