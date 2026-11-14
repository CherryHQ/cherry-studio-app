import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { OnboardingButton, OnboardingPage } from '../components/OnboardingPage';
import { useOnboardingProgress } from '../setup/useOnboardingProgress';

/** The first-use frame; the route supplies the existing provider catalog. */
export function OnboardingProviderScreen({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const progress = useOnboardingProgress();
  return (
    <OnboardingPage
      footer={
        <OnboardingButton
          loading={progress.isSaving}
          onPress={() => void progress.skip()}
          testID="onboarding-provider-skip"
          variant="text"
        >
          {t('onboarding.skip')}
        </OnboardingButton>
      }
      onBack={progress.isSaving ? undefined : () => router.replace('/onboarding')}
      step={{ current: 1, total: 3, label: t('onboarding.step', { current: 1 }) }}
      title={t('onboarding.provider.title')}
      variant="content"
    >
      {children}
    </OnboardingPage>
  );
}
