import { useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { getPrivacyPolicyUrl, usePrivacyConsent } from '@/frontend/appShell/privacy';
import { usePreference } from '@/frontend/data';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

import {
  OnboardingButton,
  OnboardingChoice,
  OnboardingLink,
  OnboardingPage,
} from '../components/OnboardingPage';
import type { OnboardingProgress } from './useOnboardingProgress';

export function IntroOnboardingStep({ progress }: { progress: OnboardingProgress }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const privacy = usePrivacyConsent();
  const [analyticsEnabled] = usePreference('app.privacy.data_collection.enabled');
  const [shareAnalytics, setShareAnalytics] = useState(analyticsEnabled);
  const welcome = progress.status === 'welcome' || progress.status === 'unseen';
  const busy = progress.isSaving || privacy.isSaving;
  const continueAfterConsent = async () => {
    if (busy) return;
    const saved = await (shareAnalytics ? privacy.accept() : privacy.decline());
    if (saved) await progress.advance('permissions');
    else toast.show({ label: t('privacyConsent.saveFailed'), variant: 'danger' });
  };
  return (
    <OnboardingPage
      description={t(welcome ? 'onboarding.intro.description' : 'onboarding.privacy.description')}
      footer={
        <OnboardingButton
          loading={busy}
          onPress={() => void (welcome ? progress.advance('privacy') : continueAfterConsent())}
          testID={welcome ? 'onboarding-start' : 'onboarding-privacy-continue'}
        >
          {t(welcome ? 'onboarding.intro.start' : 'onboarding.continue')}
        </OnboardingButton>
      }
      onBack={welcome || busy ? undefined : () => void progress.advance('welcome')}
      step={
        welcome
          ? undefined
          : { current: 1, total: 4, label: t('onboarding.preparation.step', { current: 1 }) }
      }
      testID={welcome ? 'onboarding-welcome' : 'onboarding-privacy'}
      title={t(welcome ? 'onboarding.welcome.title' : 'privacyConsent.title')}
      variant={welcome ? 'welcome' : 'step'}
    >
      {!welcome ? (
        <View className="gap-8">
          <OnboardingChoice
            checked={shareAnalytics}
            description={t('onboarding.privacy.analyticsDescription')}
            disabled={busy}
            onPress={() => setShareAnalytics((value) => !value)}
            testID="onboarding-analytics"
            title={t('onboarding.privacy.analytics')}
          />
          <OnboardingLink
            onPress={() =>
              void openExternalUrl(getPrivacyPolicyUrl(i18n.language)).catch(() =>
                toast.show({ label: t('onboarding.linkFailed'), variant: 'danger' }),
              )
            }
          >
            {t('privacyConsent.readPolicy')}
          </OnboardingLink>
        </View>
      ) : null}
    </OnboardingPage>
  );
}
