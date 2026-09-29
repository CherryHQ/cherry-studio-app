import { Button, Dialog, Spinner } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

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
  const percent = state.total > 0 ? Math.floor((state.completed / state.total) * 100) : null;

  return (
    <Dialog
      onOpenChange={ignoreClose}
      open={title !== undefined}
      testID="backup-progress-dialog"
      title={title ? t(title) : ''}
    >
      {percent === null ? (
        <View className="h-8 items-center justify-center">
          <Spinner accessibilityLabel={title ? t(title) : undefined} size="sm" />
        </View>
      ) : (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          accessibilityValue={{ max: 100, min: 0, now: percent }}
          className="flex-row items-center gap-3"
        >
          <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <View className="h-full rounded-full bg-foreground" style={{ width: `${percent}%` }} />
          </View>
          <Text className="w-10 text-right text-sm tabular-nums text-muted-foreground">
            {percent}%
          </Text>
        </View>
      )}
      <Button onPress={backup.cancel} variant="secondary">
        {t('common.cancel')}
      </Button>
    </Dialog>
  );
}
