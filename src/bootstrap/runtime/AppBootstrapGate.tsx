import type { PropsWithChildren } from 'react';

import { RestoreRestartScreen } from '@/frontend/appShell/backup';
import { StartupFailureScreen } from '@/frontend/appShell/recovery';
import { useBackupState } from '@/frontend/hooks/useBackupState';
import { BackupError } from '@/shared/contracts/backup';

import { useAppBootstrapState } from './AppBootstrapProvider';

export function AppBootstrapGate({ children }: PropsWithChildren) {
  const state = useAppBootstrapState();
  const { state: backupState } = useBackupState();

  if (
    backupState.phase === 'restart-required' ||
    (state.status === 'error' &&
      state.error instanceof BackupError &&
      state.error.code === 'restart-required')
  ) {
    return <RestoreRestartScreen />;
  }

  if (state.status === 'loading') {
    return null;
  }

  if (state.status === 'error') {
    // Throwing here would crash on every launch; the failure is already logged.
    return <StartupFailureScreen onRetry={state.retry} />;
  }

  return children;
}
