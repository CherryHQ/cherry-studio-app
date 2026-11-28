import { ContentState } from '@cherrystudio/ui/components';
import { Redirect, type Href } from 'expo-router';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useStartupReadyAfterFrames } from '@/frontend/appShell/startup/useStartupReadyAfterFrames';
import { usePreference } from '@/frontend/data';

import { useFirstUseAdmission } from '../FirstUseAdmission';

function Loading() {
  return <View className="flex-1 bg-background" />;
}

/** Commit before leaving, including before the SDK can switch to a new profile. */
function OnboardingRedirect({ href, status }: { href: Href; status: 'welcome' }) {
  const { t } = useTranslation();
  const [, setStatus] = usePreference('app.onboarding.status');
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reportReadyAfterFrames = useStartupReadyAfterFrames();

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
      <View className="flex-1 justify-center bg-background px-6" onLayout={reportReadyAfterFrames}>
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

/** Admits the drawer route after first-use status is known. */
export function FirstUseGate({ children }: PropsWithChildren) {
  switch (useFirstUseAdmission()) {
    case 'checking':
      return <Loading />;
    case 'new':
      return <OnboardingRedirect href="/onboarding" status="welcome" />;
    case 'resume':
      return <Redirect href="/onboarding" />;
    case 'admitted':
      return children;
  }
}
