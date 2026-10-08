import { useToast } from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { BackupError, type BackupErrorCode } from '@/shared/contracts/backup';

const ERROR_KEYS: Record<BackupErrorCode, string> = {
  unavailable: 'backup.unavailable',
  busy: 'backup.error.busy',
  cancelled: 'common.cancel',
  invalid: 'backup.error.invalid',
  incompatible: 'backup.error.incompatible',
  'too-large': 'backup.limits',
  'disk-space': 'backup.error.space',
  'missing-files': 'backup.error.missing',
  storage: 'backup.error.storage',
  'restart-required': 'backup.restart.description',
};

/** Shows a backup failure; cancellation and the restart boundary have their own surfaces. */
export function useBackupErrorReporter() {
  const { t } = useTranslation();
  const { toast } = useToast();
  return useCallback(
    (error: unknown) => {
      if (
        error instanceof BackupError &&
        (error.code === 'cancelled' || error.code === 'restart-required')
      )
        return;
      const key = error instanceof BackupError ? ERROR_KEYS[error.code] : 'backup.error.storage';
      toast.show({ label: t(key), variant: 'danger' });
    },
    [t, toast],
  );
}
