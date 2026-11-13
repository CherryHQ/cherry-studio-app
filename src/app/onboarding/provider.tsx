import { OnboardingProviderScreen } from '@/frontend/features/onboarding/provider';
import { ProviderCatalogContent } from '@/frontend/features/settings/provider/catalog';

export default function OnboardingProviderRoute() {
  return (
    <OnboardingProviderScreen>
      <ProviderCatalogContent searchLayout="embedded" setupIntent="chat" />
    </OnboardingProviderScreen>
  );
}
