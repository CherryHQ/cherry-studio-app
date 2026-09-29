import type { PropsWithChildren } from 'react';

import { RestoreRestartScreen } from '@/frontend/appShell/backup';
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
    throw state.error;
  }

  return children;
}
