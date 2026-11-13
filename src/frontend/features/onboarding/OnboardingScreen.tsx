import { Redirect } from 'expo-router';

import { usePrivacyConsentPending } from '@/frontend/appShell/privacy';

import { AccountOnboardingStep } from './setup/AccountOnboardingStep';
import { IntroOnboardingStep } from './setup/IntroOnboardingStep';
import { ModelSourceOnboardingStep } from './setup/ModelSourceOnboardingStep';
import { NotificationsOnboardingStep } from './setup/NotificationsOnboardingStep';
import { PermissionsOnboardingStep } from './setup/PermissionsOnboardingStep';
import { useOnboardingProgress } from './setup/useOnboardingProgress';

/** New users stay in one visual flow; the SDK still owns sign-in and profile switching. */
export function OnboardingScreen() {
  const progress = useOnboardingProgress();
  const privacyPending = usePrivacyConsentPending();
  if (progress.status === 'completed' || progress.status === 'skipped')
    return <Redirect href="/" />;
  if (
    progress.status === 'unseen' ||
    progress.status === 'welcome' ||
    progress.status === 'privacy'
  )
    return <IntroOnboardingStep progress={progress} />;
  // A policy change during an interrupted setup is disclosed inline before proceeding.
  if (privacyPending) return <IntroOnboardingStep progress={{ ...progress, status: 'privacy' }} />;
  if (progress.status === 'permissions') return <PermissionsOnboardingStep progress={progress} />;
  if (progress.status === 'notifications')
    return <NotificationsOnboardingStep progress={progress} />;
  if (progress.status === 'login') return <AccountOnboardingStep progress={progress} />;
  return <ModelSourceOnboardingStep progress={progress} />;
}
