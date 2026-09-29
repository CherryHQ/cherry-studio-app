import { Button, Dialog } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { useBackupState } from '@/frontend/hooks/useBackupState';
import type { BackupState } from '@/shared/contracts/backup';

const RUNNING_PHASE_TITLES: Partial<Record<BackupState['phase'], string>> = {
  capturing: 'backup.progress.export',
  packing: 'backup.progress.export',
  validating: 'backup.progress.import',
  staging: 'backup.progress.restore',
};

/** Ignores Android Back and overlay presses: only finishing or cancelling closes it. */
const ignoreClose = () => undefined;

/**
 * Blocks the whole app while a backup or restore runs. Mounted beside the root stack so the
 * user cannot act on any route until the operation finishes or is cancelled.
 */
export function BackupProgressGate() {
  const { t } = useTranslation();
  const { backup, state } = useBackupState();
  const title = RUNNING_PHASE_TITLES[state.phase];

  return (
    <Dialog
      onOpenChange={ignoreClose}
      open={title !== undefined}
      testID="backup-progress-dialog"
      title={title ? t(title) : ''}
    >
      <Text accessibilityLiveRegion="polite" className="text-base text-muted-foreground">
        {state.total > 0 ? `${Math.floor((state.completed / state.total) * 100)}%` : '…'}
      </Text>
      <Button onPress={backup.cancel} variant="outline">
        {t('common.cancel')}
      </Button>
    </Dialog>
  );
}
