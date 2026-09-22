import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { BaseService, DependsOn, Injectable } from '@/backend/core/lifecycle';
import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import {
  bundledBackupVersion,
  captureDatabase,
  prepareRestoredDatabase,
  readDevicePreferences,
  validateBackupDatabase,
} from '@/backend/data/db/backupDatabase';
import type { DbService } from '@/backend/data/db/DbService';
import {
  backupStorageNative,
  databaseDirectory,
  getStorageBoot,
  stageStorage,
  storageDirectory,
} from '@/backend/data/storage/storagePaths';
import { BackupError, type BackupModule, type BackupState } from '@/shared/contracts/backup';

import { getBackupStorage } from '../../../../modules/backup-storage';
import { archiveFile, packBackup, unpackBackup } from './backupArchive';
import { BACKUP_LIMITS, type BackupManifest, validateManifest } from './backupFormat';
import {
  captureResources,
  requireDiskSpace,
  restoredFile,
  validateResourceReferences,
} from './backupResources';

@Injectable('BackupRuntime')
@DependsOn(['DbService'])
export class BackupRuntime extends BaseService implements BackupModule {
  private state: BackupState = { phase: 'idle', completed: 0, total: 0 };
  private readonly listeners = new Set<() => void>();
  private operation: AbortController | undefined;
  private pendingWork: Promise<unknown> | undefined;
  private candidate: { directory: Directory; manifest: BackupManifest } | undefined;
  private exported: Directory | undefined;
  private hasActiveWork: () => boolean = () => true;
  private resumeWork: () => void = () => {};
  private stopped = false;

  constructor(private readonly dbService: DbService) {
    super();
  }

  configure(hasActiveWork: () => boolean, resumeWork: () => void): void {
    this.hasActiveWork = hasActiveWork;
    this.resumeWork = resumeWork;
  }
  isAvailable = (): boolean => getBackupStorage() !== null;
  getState = (): BackupState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(state: BackupState): void {
    this.state = state;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* Subscribers cannot change the storage outcome. */
      }
    }
  }

  createBackup = (): Promise<{ uri: string; filename: string }> =>
    this.run('capturing', async (signal) => {
      this.discardCandidate();
      if (this.exported?.exists) this.exported.delete();
      const work = this.workDirectory('export');
      let completed = false;
      try {
        const version = await bundledBackupVersion();
        requireDiskSpace(new File(databaseDirectory(), 'cherry.db').size * 2);
        const release = this.freeze();
        let resources: Awaited<ReturnType<typeof captureResources>>;
        try {
          const database = archiveFile(work, 'database/cherry.db');
          await captureDatabase(this.dbService.getSqlite(), database);
          resources = await captureResources(storageDirectory(), work, signal);
        } finally {
          release();
        }
        // An incomplete package must not be presented as a complete first-release backup.
        if (resources.missing.length) throw new BackupError('missing-files');
        await validateBackupDatabase(archiveFile(work, 'database/cherry.db'), version);
        const entries: BackupManifest['entries'] = [];
        for (const [index, path] of resources.paths.entries()) {
          signal.throwIfAborted();
          const file = archiveFile(work, path);
          entries.push({
            path,
            size: file.size,
            sha256: await backupStorageNative().hashFile(file.uri),
          });
          this.publish({ phase: 'packing', completed: index, total: resources.paths.length * 2 });
        }
        if (Platform.OS !== 'ios' && Platform.OS !== 'android')
          throw new BackupError('unavailable');
        const manifest = validateManifest({
          product: 'cherry-mobile',
          formatVersion: 1,
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          appVersion: Constants.expoConfig?.version ?? 'unknown',
          platform: Platform.OS,
          ...version,
          entries,
          counts: resources.counts,
          missing: resources.missing,
        });
        const json = JSON.stringify(manifest);
        const manifestBytes = new TextEncoder().encode(json).length;
        if (
          manifestBytes > BACKUP_LIMITS.manifestBytes ||
          manifestBytes + entries.reduce((sum, entry) => sum + entry.size, 0) >
            BACKUP_LIMITS.expandedBytes
        )
          throw new BackupError('too-large');
        const manifestFile = archiveFile(work, 'manifest.json');
        manifestFile.create();
        manifestFile.write(json);
        requireDiskSpace(entries.reduce((sum, entry) => sum + entry.size, 0));
        const filename = `cherry-mobile-${manifest.createdAt.replace(/[:.]/g, '-')}-${manifest.id.slice(0, 8)}.zip`;
        const output = new File(work, filename);
        await packBackup(work, manifest, output, signal, (done, total) =>
          this.publish({ phase: 'packing', completed: done, total }),
        );
        this.exported = work;
        completed = true;
        this.publish({ phase: 'idle', completed: 0, total: 0 });
        return { uri: output.uri, filename };
      } finally {
        if (!completed && work.exists) work.delete();
      }
    });

  prepareRestore = (uri: string): Promise<void> =>
    this.run('validating', async (signal) => {
      this.discardCandidate();
      const work = this.workDirectory('import');
      let completed = false;
      try {
        const source = new File(uri);
        if (!source.exists || source.size > BACKUP_LIMITS.archiveBytes)
          throw new BackupError('too-large');
        requireDiskSpace(source.size);
        const owned = new File(work, 'input.zip');
        await source.copy(owned);
        const extracted = new Directory(work, 'extracted');
        extracted.create();
        const manifest = await unpackBackup(owned, extracted, signal, (done, total) =>
          this.publish({ phase: 'validating', completed: done, total }),
        );
        owned.delete();
        signal.throwIfAborted();
        await validateBackupDatabase(archiveFile(extracted, 'database/cherry.db'), manifest);
        await validateResourceReferences(extracted, manifest);
        signal.throwIfAborted();
        this.candidate = { directory: work, manifest };
        completed = true;
        this.publish({
          phase: 'ready',
          completed: 0,
          total: 0,
          preview: {
            id: manifest.id,
            createdAt: manifest.createdAt,
            appVersion: manifest.appVersion,
            platform: manifest.platform,
            ...manifest.counts,
            bytes: manifest.entries.reduce((sum, entry) => sum + entry.size, 0),
            missingFiles: manifest.missing.length,
          },
        });
      } finally {
        if (!completed && work.exists) work.delete();
      }
    });

  applyRestore = (candidateId: string): Promise<void> =>
    this.run('staging', async (signal) => {
      const candidate = this.candidate;
      if (!candidate || candidate.manifest.id !== candidateId) throw new BackupError('invalid');
      const { manifest } = candidate;
      const extracted = new Directory(candidate.directory, 'extracted');
      const size = manifest.entries.reduce((sum, entry) => sum + entry.size, 0);
      requireDiskSpace(size + archiveFile(extracted, 'database/cherry.db').size);
      const target = storageDirectory(randomUUID());
      target.create({ intermediates: true });
      let staged = false;
      let release: (() => void) | undefined;
      try {
        for (const [index, entry] of manifest.entries.entries()) {
          signal.throwIfAborted();
          const source = archiveFile(extracted, entry.path);
          if (
            source.size !== entry.size ||
            (await backupStorageNative().hashFile(source.uri)) !== entry.sha256
          )
            throw new BackupError('invalid');
          const output = restoredFile(target, entry.path);
          output.parentDirectory.create({ intermediates: true, idempotent: true });
          await source.copy(output);
          this.publish({ phase: 'staging', completed: index + 1, total: manifest.entries.length });
        }
        signal.throwIfAborted();
        release = this.freeze();
        await prepareRestoredDatabase(
          new File(target, 'database', 'cherry.db'),
          await readDevicePreferences(this.dbService.getSqlite()),
        );
        signal.throwIfAborted();
        const restoredManifest: BackupManifest = {
          ...manifest,
          ...(await bundledBackupVersion()),
          entries: [],
        };
        for (const entry of manifest.entries) {
          signal.throwIfAborted();
          const file = restoredFile(target, entry.path);
          restoredManifest.entries.push({
            ...entry,
            size: file.size,
            sha256: await backupStorageNative().hashFile(file.uri),
          });
        }
        const manifestFile = new File(target, 'restore-manifest.json');
        manifestFile.create();
        manifestFile.write(JSON.stringify(validateManifest(restoredManifest)));
        await backupStorageNative().sealDirectory(target.uri);
        signal.throwIfAborted();
        // From this durable marker onwards, the live process stays read-only until a real restart.
        // Keep the candidate even if the control write reports an ambiguous fsync failure.
        staged = true;
        try {
          stageStorage(target.name);
        } catch {
          this.publish({ phase: 'restart-required', completed: 0, total: 0 });
          throw new BackupError('restart-required');
        }
        this.publish({ phase: 'restart-required', completed: 0, total: 0 });
        this.discardCandidate();
      } finally {
        if (!staged) {
          release?.();
          if (target.exists) target.delete();
        }
      }
    });

  cancel = (): void => {
    if (this.state.phase === 'restart-required') return;
    if (this.operation) this.operation.abort();
    else {
      this.discardCandidate();
      this.publish({ phase: 'idle', completed: 0, total: 0 });
    }
  };

  private freeze(): () => void {
    if (this.hasActiveWork() || getStorageBoot().restartRequired) throw new BackupError('busy');
    const release = storageMutationGate.freeze();
    try {
      this.dbService.getSqlite().execSync('PRAGMA query_only = ON');
    } catch (error) {
      release();
      throw error;
    }
    return () => {
      try {
        this.dbService.getSqlite().execSync('PRAGMA query_only = OFF');
      } finally {
        release();
        this.resumeWork();
      }
    };
  }

  private run<T>(
    phase: BackupState['phase'],
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (!this.isAvailable()) return Promise.reject(new BackupError('unavailable'));
    if (this.stopped || this.operation || this.state.phase === 'restart-required')
      return Promise.reject(new BackupError('busy'));
    const operation = new AbortController();
    this.operation = operation;
    this.publish({ phase, completed: 0, total: 0 });
    const promise = work(operation.signal)
      .catch((error: unknown) => {
        if (this.state.phase !== 'restart-required')
          this.publish({ phase: 'idle', completed: 0, total: 0 });
        if (operation.signal.aborted) throw new BackupError('cancelled');
        if (error instanceof BackupError) throw error;
        if (/ENOSPC|no space|disk.*full/i.test(String(error))) throw new BackupError('disk-space');
        throw new BackupError(phase === 'validating' ? 'invalid' : 'storage');
      })
      .finally(() => {
        this.operation = undefined;
        this.pendingWork = undefined;
      });
    this.pendingWork = promise;
    return promise;
  }

  private workDirectory(kind: string): Directory {
    const directory = new Directory(
      Paths.cache,
      'backups',
      backupStorageNative().processId(),
      `${kind}-${randomUUID()}`,
    );
    directory.create({ intermediates: true });
    return directory;
  }

  private discardCandidate(): void {
    const candidate = this.candidate;
    this.candidate = undefined;
    if (candidate?.directory.exists) candidate.directory.delete();
  }

  protected async onStop(): Promise<void> {
    this.stopped = true;
    this.operation?.abort();
    await this.pendingWork?.catch(() => {});
    this.listeners.clear();
  }
}
