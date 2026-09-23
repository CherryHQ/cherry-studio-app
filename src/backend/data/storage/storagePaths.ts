import { Directory, File, Paths } from 'expo-file-system';
import { defaultDatabaseDirectory } from 'expo-sqlite';

import { BackupError, type RestoreOutcome } from '@/shared/contracts/backup';

import { getBackupStorage } from '../../../../modules/backup-storage';
import {
  selectBootStorage,
  StorageControlSchema,
  StorageIdSchema,
  type StorageControl,
} from './storageControl';

let boot: ReturnType<typeof selectBootStorage> | undefined;

export function backupStorageNative() {
  const native = getBackupStorage();
  if (!native) throw new BackupError('unavailable');
  return native;
}

function writeControl(control: StorageControl): void {
  backupStorageNative().writeControl(
    Paths.document.uri,
    JSON.stringify(StorageControlSchema.parse(control)),
  );
}

export function getStorageBoot() {
  if (boot) return boot;
  const native = getBackupStorage();
  if (!native) {
    if (
      new Directory(Paths.document, 'storage-control').exists ||
      new Directory(Paths.document, 'stores').exists
    ) {
      throw new BackupError('unavailable');
    }
    boot = {
      control: { version: 1, current: 'legacy' },
      storageId: 'legacy',
      restoring: false,
      resetCaches: false,
      restartRequired: false,
    };
    return boot;
  }
  const raw = native.readControl(Paths.document.uri);
  if (raw === null && new Directory(Paths.document, 'stores').exists) {
    throw new BackupError(
      'storage',
      'Storage control is missing; refusing to open an empty database.',
    );
  }
  const control: StorageControl =
    raw === null ? { version: 1, current: 'legacy' } : StorageControlSchema.parse(JSON.parse(raw));
  const selected = selectBootStorage(control, native.processId());
  if (raw === null || JSON.stringify(selected.control) !== JSON.stringify(control))
    writeControl(selected.control);
  boot = selected;
  return boot;
}

export function storageDirectory(id = getStorageBoot().storageId): Directory {
  StorageIdSchema.parse(id);
  return id === 'legacy' ? Paths.document : new Directory(Paths.document, 'stores', id);
}

export function databaseDirectory(id = getStorageBoot().storageId): string {
  return id === 'legacy'
    ? defaultDatabaseDirectory
    : new Directory(storageDirectory(id), 'database').uri;
}

export function stageStorage(id: string): void {
  const state = getStorageBoot();
  if (state.restoring || state.restartRequired || state.control.pending || id === 'legacy')
    throw new BackupError('busy');
  const control: StorageControl = {
    ...state.control,
    pending: {
      id: StorageIdSchema.parse(id),
      processId: backupStorageNative().processId(),
      phase: 'staged',
    },
  };
  writeControl(control);
  boot = { ...state, control, restartRequired: true };
}

export function commitStorageBoot(): void {
  const state = getStorageBoot();
  if (!state.restoring) return;
  const control: StorageControl = { version: 1, current: state.storageId, lastResult: 'restored' };
  writeControl(control);
  boot = { ...state, control, restoring: false, outcome: 'restored' };
}

/**
 * The candidate failed validation before anything opened it, so this process can keep
 * using the current generation instead of asking for another native restart.
 */
export function rejectStorageCandidate(): void {
  const state = getStorageBoot();
  if (!state.restoring) return;
  const { pending: _pending, ...settled } = state.control;
  const control: StorageControl = { ...settled, lastResult: 'rolled-back' };
  writeControl(control);
  boot = {
    control,
    storageId: control.current,
    restoring: false,
    resetCaches: false,
    restartRequired: false,
    outcome: 'rolled-back',
  };
}

/** Returns the restore outcome settled by this boot at most once. */
export function takeStorageOutcome(): RestoreOutcome | undefined {
  if (!boot?.outcome) return undefined;
  const { outcome, ...rest } = boot;
  boot = rest;
  return outcome;
}

export function failStorageBoot(): void {
  const state = getStorageBoot();
  if (!state.restoring) return;
  const { pending: _pending, ...previous } = state.control;
  const control: StorageControl = {
    ...previous,
    lastResult: 'rolled-back',
    failedProcessId: backupStorageNative().processId(),
  };
  writeControl(control);
  boot = { ...state, control, restoring: false, restartRequired: true };
}

/** Run after a successful boot, at most once per native process. Keeps only the current generation. */
export function cleanupStorageAfterBoot(): void {
  const native = getBackupStorage();
  if (!native) return;
  const state = getStorageBoot();
  const processId = native.processId();
  if (
    state.restoring ||
    state.restartRequired ||
    state.control.pending ||
    state.control.cleanupProcessId === processId
  )
    return;
  const control = { ...state.control, cleanupProcessId: processId };
  writeControl(control);
  boot = { ...state, control };
  const stores = new Directory(Paths.document, 'stores');
  if (stores.exists) {
    for (const entry of stores.list()) {
      if (
        entry instanceof Directory &&
        StorageIdSchema.safeParse(entry.name).success &&
        entry.name !== control.current
      )
        entry.delete();
    }
  }
  if (control.current !== 'legacy') {
    // Never delete Documents or the shared SQLite directory themselves.
    for (const name of ['cherry.db', 'cherry.db-wal', 'cherry.db-shm']) {
      const file = new File(defaultDatabaseDirectory, name);
      if (file.exists) file.delete();
    }
    for (const parts of [
      ['Data', 'Files'],
      ['user-avatar'],
      ['agent-avatars'],
      ['provider-avatars'],
    ]) {
      const directory = new Directory(Paths.document, ...parts);
      if (directory.exists) directory.delete();
    }
  }
  const cache = new Directory(Paths.cache, 'backups');
  if (cache.exists) {
    for (const entry of cache.list()) {
      if (entry instanceof Directory && entry.name !== processId) entry.delete();
    }
  }
  for (const entry of Paths.cache.list()) {
    if (entry instanceof Directory && entry.name.startsWith('backup-schema-')) entry.delete();
  }
}

export function assertStorageDatabaseExists(): void {
  const state = getStorageBoot();
  if (state.restartRequired) throw new BackupError('restart-required');
  if (
    (state.storageId !== 'legacy' || state.control.lastResult === 'rolled-back') &&
    !new File(databaseDirectory(), 'cherry.db').exists
  ) {
    throw new BackupError('storage', 'The selected database is missing.');
  }
}
