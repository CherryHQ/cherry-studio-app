import { useToast } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { useFirstUseEligibility } from '@/frontend/appShell/navigation';
import { usePreference } from '@/frontend/data';
import { editionCapabilities } from '@/shared/data/managedPolicy';

import { PrivacyConsentDialog } from './PrivacyConsentDialog';
import { usePrivacyConsent } from './usePrivacyConsent';

/**
 * Blocks the app on the data-collection disclosure until the user answers it.
 *
 * Mounted beside the root stack rather than inside onboarding: an install that
 * has already finished onboarding still has to see a new policy, and the dialog
 * has to cover whatever route it lands on.
 */
export function PrivacyConsentGate() {
  const [status] = usePreference('app.onboarding.status');
  if (status === 'unseen' && editionCapabilities().providerOnboarding)
    return <FirstRunPrivacyConsentGate />;
  // First-use owns inline consent. Existing installations still see policy updates as a dialog.
  if (status !== 'unseen' && status !== 'completed' && status !== 'skipped') return null;
  return <ExistingPrivacyConsentGate />;
}

function FirstRunPrivacyConsentGate() {
  const eligibility = useFirstUseEligibility();
  return eligibility === 'existing' ? <ExistingPrivacyConsentGate /> : null;
}

function ExistingPrivacyConsentGate() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { accept, decline, isPending, isSaving } = usePrivacyConsent();

  const record = (choose: () => Promise<boolean>) => {
    void choose().then((saved) => {
      // A failed write keeps the dialog open; nothing may be collected on a
      // choice that is not on disk.
      if (!saved) toast.show({ label: t('privacyConsent.saveFailed'), variant: 'danger' });
    });
  };

  return (
    <PrivacyConsentDialog
      isSaving={isSaving}
      onAccept={() => record(accept)}
      onDecline={() => record(decline)}
      open={isPending}
    />
  );
}
