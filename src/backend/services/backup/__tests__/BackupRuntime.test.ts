import type { DbService } from '@/backend/data/db/DbService';

import { BackupRuntime } from '../BackupRuntime';

jest.mock('../../../../../modules/backup-storage', () => ({
  getBackupStorage: () => ({ processId: () => '10000000-0000-4000-8000-000000000001' }),
}));
jest.mock('@/backend/data/storage/storagePaths', () => ({
  backupStorageNative: () => ({ processId: () => '10000000-0000-4000-8000-000000000001' }),
  getStorageBoot: () => ({ restartRequired: false }),
  takeStorageOutcome: () => undefined,
}));
jest.mock('@/backend/data/db/backupDatabase', () => ({}));
jest.mock('expo-file-system', () => {
  class Entry {
    exists = false;
    create() {
      this.exists = true;
    }
    delete() {
      this.exists = false;
    }
  }
  return { Directory: Entry, File: Entry, Paths: { cache: 'file:///cache/' } };
});

test('publishes progress through its own state rather than the lifecycle state', async () => {
  const runtime = new BackupRuntime({} as DbService);
  const phases: string[] = [];
  runtime.subscribe(() => phases.push(runtime.getState().phase));

  await expect(runtime.prepareRestore('file:///picked/backup.zip')).rejects.toMatchObject({
    code: 'invalid',
  });

  expect(phases).toEqual(['validating', 'idle']);
  expect(runtime.getState()).toEqual({ phase: 'idle', completed: 0, total: 0 });
});
