import * as Application from 'expo-application';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { BaseService, DependsOn, Injectable } from '@/backend/core/lifecycle';
import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import {
  bundledBackupVersion,
  captureDatabase,
  normalizeBackupDatabase,
  prepareRestoredDatabase,
  readDevicePreferences,
} from '@/backend/data/db/backupDatabase';
import type { DbService } from '@/backend/data/db/DbService';
import {
  backupStorageNative,
  databaseDirectory,
  getStorageBoot,
  stageStorage,
  storageDirectory,
  takeStorageOutcome,
} from '@/backend/data/storage/storagePaths';
import { hashLocalFile } from '@/backend/services/file/fileHash';
import {
  BackupError,
  type BackupModule,
  type BackupState,
  type RestoreOutcome,
} from '@/shared/contracts/backup';

import { getBackupStorage } from '../../../../modules/backup-storage';
import { archiveFile, packBackup, unpackBackup } from './backupArchive';
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_LIMITS,
  type BackupManifest,
  validateManifest,
} from './backupFormat';
import {
  captureResources,
  requireDiskSpace,
  restoredFile,
  validateResourceReferences,
} from './backupResources';

// Keep native size snapshots cooperative by yielding every 64 entries.
const INVENTORY_YIELD_ENTRIES = 64;

@Injectable('BackupRuntime')
@DependsOn(['DbService'])
export class BackupRuntime extends BaseService implements BackupModule {
  // `state` belongs to BaseService's lifecycle getter; shadowing it would drop every update.
  private backupState: BackupState = { phase: 'idle', completed: 0, total: 0 };
  private readonly listeners = new Set<() => void>();
  private operation: AbortController | undefined;
  private pendingWork: Promise<unknown> | undefined;
  private candidate: { directory: Directory; manifest: BackupManifest } | undefined;
  private exported: Directory | undefined;
  private hasActiveWork: () => boolean = () => true;
  private resumeWork: () => void = () => {};
  private stopped = false;
  private quiesceAgent: () => Promise<void> = async () => {};

  constructor(private readonly dbService: DbService) {
    super();
  }

  configure(
    hasActiveWork: () => boolean,
    resumeWork: () => void,
    quiesceAgent: () => Promise<void> = async () => {},
  ): void {
    this.hasActiveWork = hasActiveWork;
    this.resumeWork = resumeWork;
    this.quiesceAgent = quiesceAgent;
  }
  isAvailable = (): boolean => getBackupStorage() !== null;
  getState = (): BackupState => this.backupState;
  takeRestoreOutcome = (): RestoreOutcome | undefined => takeStorageOutcome();
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(state: BackupState): void {
    this.backupState = state;
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
      this.discardExport();
      const work = this.workDirectory('export');
      let completed = false;
      try {
        const version = await bundledBackupVersion();
        requireDiskSpace(new File(databaseDirectory(), 'cherry.db').size * 2);
        const release = this.freeze();
        let resources: Awaited<ReturnType<typeof captureResources>>;
        try {
          await this.quiesceAgent();
          const database = archiveFile(work, 'database/cherry.db');
          await captureDatabase(this.dbService.getSqlite(), database);
          requireDiskSpace(database.size);
          await normalizeBackupDatabase(database, version, 'export');
          resources = await captureResources(storageDirectory(), work, signal);
        } finally {
          release();
        }
        signal.throwIfAborted();
        let payloadBytes = 0;
        const payloads: { path: string; file: File; size: number }[] = [];
        for (const path of resources.paths) {
          signal.throwIfAborted();
          const file = archiveFile(work, path);
          const size = file.size;
          if (!Number.isSafeInteger(size) || size < 0) throw new BackupError('invalid');
          payloadBytes += size;
          if (!Number.isSafeInteger(payloadBytes)) throw new BackupError('invalid');
          if (payloadBytes > BACKUP_LIMITS.expandedBytes) throw new BackupError('too-large');
          payloads.push({ path, file, size });
          if (payloads.length % INVENTORY_YIELD_ENTRIES === 0) {
            signal.throwIfAborted();
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            signal.throwIfAborted();
          }
        }
        if (payloads.length > BACKUP_LIMITS.entries) throw new BackupError('too-large');
        const totalBytes = 2 * payloadBytes;
        let lastPercentage = -1;
        const publishPacking = (completed: number) => {
          signal.throwIfAborted();
          const percentage = totalBytes > 0 ? Math.floor((completed / totalBytes) * 100) : 0;
          if (percentage === lastPercentage) return;
          lastPercentage = percentage;
          this.publish({ phase: 'packing', completed, total: totalBytes });
        };
        publishPacking(0);
        const entries: BackupManifest['entries'] = [];
        let hashedBytes = 0;
        for (const { path, file, size } of payloads) {
          signal.throwIfAborted();
          const sha256 = await hashLocalFile(file.uri, signal);
          signal.throwIfAborted();
          entries.push({ path, size, sha256 });
          hashedBytes += size;
          publishPacking(hashedBytes);
        }
        if (Platform.OS !== 'ios' && Platform.OS !== 'android')
          throw new BackupError('unavailable');
        const manifest = validateManifest({
          product: 'cherry-mobile',
          formatVersion: BACKUP_FORMAT_VERSION,
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          appVersion: Application.nativeApplicationVersion ?? 'unknown',
          platform: Platform.OS,
          ...version,
          entries,
          counts: resources.counts,
        });
        const json = JSON.stringify(manifest);
        const manifestBytes = new TextEncoder().encode(json).length;
        if (
          manifestBytes > BACKUP_LIMITS.manifestBytes ||
          manifestBytes + payloadBytes > BACKUP_LIMITS.expandedBytes
        )
          throw new BackupError('too-large');
        const manifestFile = archiveFile(work, 'manifest.json');
        manifestFile.create();
        manifestFile.writeSync(json);
        requireDiskSpace(payloadBytes);
        const filename = `cherry-mobile-${manifest.createdAt.replace(/[:.]/g, '-')}-${manifest.id.slice(0, 8)}.zip`;
        const output = new File(work, filename);
        await packBackup(work, manifest, output, signal, (done, total) => {
          if (total !== payloadBytes) throw new BackupError('invalid');
          publishPacking(payloadBytes + done);
        });
        signal.throwIfAborted();
        this.exported = work;
        completed = true;
        this.publish({
          phase: 'exported',
          completed: 0,
          total: 0,
          exported: {
            uri: output.uri,
            filename,
            sessions: manifest.counts.sessions,
            messages: manifest.counts.messages,
            files: manifest.counts.files,
            bytes: output.size,
          },
        });
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
        // Read the selected archive in place: every extracted byte is verified against the
        // manifest, so a private copy would only double the disk and time cost.
        const source = new File(uri);
        if (!source.exists) throw new BackupError('invalid');
        if (source.size > BACKUP_LIMITS.archiveBytes) throw new BackupError('too-large');
        const extracted = new Directory(work, 'extracted');
        extracted.create();
        const manifest = await unpackBackup(source, extracted, signal, (done, total) =>
          this.publish({ phase: 'validating', completed: done, total }),
        );
        signal.throwIfAborted();
        const database = archiveFile(extracted, 'database/cherry.db');
        requireDiskSpace(database.size);
        await normalizeBackupDatabase(database, manifest);
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
            // The archive size, matching the export summary and what the Files app shows.
            bytes: source.size,
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
      // Payloads move into the new generation unchanged; only the database is rewritten.
      requireDiskSpace(archiveFile(extracted, 'database/cherry.db').size);
      const target = storageDirectory(randomUUID());
      target.create({ intermediates: true });
      let staged = false;
      let release: (() => void) | undefined;
      try {
        // Freeze before moving anything, so a busy app fails before the candidate is consumed.
        release = this.freeze();
        await this.quiesceAgent();
        for (const [index, entry] of manifest.entries.entries()) {
          signal.throwIfAborted();
          const output = restoredFile(target, entry.path);
          output.parentDirectory.create({ intermediates: true, idempotent: true });
          await archiveFile(extracted, entry.path).move(output);
          this.publish({ phase: 'staging', completed: index + 1, total: manifest.entries.length });
        }
        signal.throwIfAborted();
        const database = new File(target, 'database', 'cherry.db');
        await prepareRestoredDatabase(
          database,
          await readDevicePreferences(this.dbService.getSqlite()),
        );
        signal.throwIfAborted();
        // Moved payloads keep their verified hashes; startup re-verifies every entry.
        const databaseHash = await hashLocalFile(database.uri, signal);
        const restoredManifest: BackupManifest = {
          ...manifest,
          ...(await bundledBackupVersion()),
          entries: manifest.entries.map((entry) =>
            entry.path === 'database/cherry.db'
              ? { ...entry, size: database.size, sha256: databaseHash }
              : entry,
          ),
        };
        const manifestFile = new File(target, 'restore-manifest.json');
        manifestFile.create();
        manifestFile.writeSync(JSON.stringify(validateManifest(restoredManifest)));
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
      } finally {
        // Moving consumed the extracted payloads, so a failed attempt needs a new selection.
        this.discardCandidate();
        if (!staged) {
          release?.();
          if (target.exists) target.delete();
        }
      }
    });

  cancel = (): void => {
    if (this.backupState.phase === 'restart-required') return;
    if (this.operation) this.operation.abort();
    else {
      this.discardCandidate();
      // A dismissed export was never saved or shared by the user; nothing else can reach it.
      if (this.backupState.phase === 'exported') this.discardExport();
      this.publish({ phase: 'idle', completed: 0, total: 0 });
    }
  };

  private freeze(): () => void {
    if (this.hasActiveWork() || getStorageBoot().restartRequired) throw new BackupError('busy');
    // The progress dialog blocks the user; this keeps new Agent turns and jobs from starting.
    const release = storageMutationGate.freeze();
    return () => {
      release();
      this.resumeWork();
    };
  }

  private run<T>(
    phase: BackupState['phase'],
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (!this.isAvailable()) return Promise.reject(new BackupError('unavailable'));
    if (this.stopped || this.operation || this.backupState.phase === 'restart-required')
      return Promise.reject(new BackupError('busy'));
    const operation = new AbortController();
    this.operation = operation;
    this.publish({ phase, completed: 0, total: 0 });
    const promise = work(operation.signal)
      .catch((error: unknown) => {
        if (this.backupState.phase !== 'restart-required')
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

  private discardExport(): void {
    const exported = this.exported;
    this.exported = undefined;
    if (exported?.exists) exported.delete();
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
