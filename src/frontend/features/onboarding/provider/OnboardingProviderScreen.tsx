import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { OnboardingPage } from '../components/OnboardingPage';

/** The first-use frame; the route supplies the existing provider catalog. */
export function OnboardingProviderScreen({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <OnboardingPage
      onBack={() => router.replace('/onboarding')}
      step={{ current: 1, total: 3, label: t('onboarding.step', { current: 1 }) }}
      title={t('onboarding.provider.title')}
      variant="content"
    >
      {children}
    </OnboardingPage>
  );
}
