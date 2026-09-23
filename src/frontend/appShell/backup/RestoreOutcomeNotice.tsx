import { useToast } from '@cherrystudio/ui/components';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data/BackendProvider';
import type { RestoreOutcome } from '@/shared/contracts/backup';

const OUTCOME_TOASTS: Record<RestoreOutcome, { label: string; variant: 'success' | 'warning' }> = {
  restored: { label: 'backup.outcome.restored', variant: 'success' },
  'rolled-back': { label: 'backup.outcome.rolled-back', variant: 'warning' },
};

/** Reports how the restore settled on the boot that settled it; the backend hands it out once. */
export function RestoreOutcomeNotice() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const backup = useBackendModule('backup');

  useEffect(() => {
    const outcome = backup.takeRestoreOutcome();
    if (!outcome) return;
    const { label, variant } = OUTCOME_TOASTS[outcome];
    toast.show({ label: t(label), variant });
  }, [backup, t, toast]);

  return null;
}
