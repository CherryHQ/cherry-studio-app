import { ContentState } from '@cherrystudio/ui/components';
import { Redirect, type Href } from 'expo-router';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { withCapability } from '@/frontend/components/Policy';
import { usePreference } from '@/frontend/data';

import { useFirstUseEligibility } from '../useFirstUseEligibility';

function Loading() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 justify-center">
      <ContentState.Loading title={t('onboarding.loading')} />
    </View>
  );
}

/** Commit before leaving, including before the SDK can switch to a new profile. */
function OnboardingRedirect({ href, status }: { href: Href; status: 'welcome' }) {
  const { t } = useTranslation();
  const [, setStatus] = usePreference('app.onboarding.status');
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void setStatus(status, { optimistic: false }).then(
      () => {
        if (active) setSaved(true);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, setStatus, status]);

  if (saved) return <Redirect href={href} />;
  if (failed)
    return (
      <View className="flex-1 justify-center px-6">
        <ContentState.Error
          title={t('onboarding.saveFailed')}
          primaryAction={{
            children: t('common.retry'),
            onPress: () => {
              setFailed(false);
              setAttempt((current) => current + 1);
            },
          }}
        />
      </View>
    );
  return <Loading />;
}

function OnboardingGate({ children }: PropsWithChildren) {
  const eligibility = useFirstUseEligibility();
  if (eligibility === 'loading') return <Loading />;
  if (eligibility === 'existing') return children;
  return <OnboardingRedirect href="/onboarding" status="welcome" />;
}

function Children({ children }: PropsWithChildren) {
  return children;
}

/**
 * Seeded Agents have no model, so first use is determined before restoring the chat route.
 * Onboarding sets up providers and default models, which the organization may own instead.
 */
const NewInstallationGate = withCapability('providerOnboarding', OnboardingGate, Children);

export function FirstUseGate({ children }: PropsWithChildren) {
  const [status] = usePreference('app.onboarding.status');
  if (status === 'unseen') return <NewInstallationGate>{children}</NewInstallationGate>;
  if (status !== 'completed' && status !== 'skipped') return <Redirect href="/onboarding" />;
  return children;
}
