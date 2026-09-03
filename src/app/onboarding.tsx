import { StartupInteractiveMarker } from '@/frontend/appShell/observability';
import { OnboardingScreen } from '@/frontend/features/onboarding';

export default function OnboardingRoute() {
  return (
    <>
      <StartupInteractiveMarker />
      <OnboardingScreen />
    </>
  );
}
