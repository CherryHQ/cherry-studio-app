import { useToast } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { PrivacyConsentSheet } from './PrivacyConsentSheet';
import { usePrivacyConsent } from './usePrivacyConsent';

/**
 * Blocks the app on the data-collection disclosure until the user answers it.
 *
 * Mounted beside the root stack rather than inside onboarding: an install that
 * has already finished onboarding still has to see a new policy, and the sheet
 * has to cover whatever route it lands on.
 */
export function PrivacyConsentGate() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { accept, decline, isPending, isSaving } = usePrivacyConsent();

  const record = (choose: () => Promise<boolean>) => {
    void choose().then((saved) => {
      // A failed write keeps the sheet open; nothing may be collected on a
      // choice that is not on disk.
      if (!saved) toast.show({ label: t('privacyConsent.saveFailed'), variant: 'danger' });
    });
  };

  return (
    <PrivacyConsentSheet
      isSaving={isSaving}
      onAccept={() => record(accept)}
      onDecline={() => record(decline)}
      open={isPending}
    />
  );
}
