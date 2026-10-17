import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import type { DbService } from '@/backend/data/db/DbService';
import { FileLibraryService } from '@/backend/data/services/FileLibraryService';
import { TrashService } from '@/backend/data/services/TrashService';
import { deleteInternalEntryFiles, notifyFileChange } from '@/backend/services/file/fileStorage';
import { loggerService } from '@/shared/core/logger/LoggerService';
import {
  TRASH_RETENTION_MS,
  type TrashItem,
  type TrashKind,
} from '@/shared/data/api/schemas/trash';
import type { FileEntryId } from '@/shared/data/types/file';

const logger = loggerService.withContext('TrashRuntime');

@Injectable('TrashRuntime')
@DependsOn(['DbService'])
@ServicePhase(Phase.PostReady)
@AppStatePolicy('foreground-refresh')
export class TrashRuntime extends BaseService {
  readonly entries: TrashService;
  private readonly files: FileLibraryService;
  private pending = 0;
  private stopped = false;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(dbService: DbService) {
    super();
    this.entries = new TrashService(dbService);
    this.files = new FileLibraryService(dbService);
  }

  protected override onInit() {
    this.registerAppStateListener((state) => {
      if (state === 'active') this.requestSweep();
    });
  }

  protected override onReady() {
    this.requestSweep();
  }

  hasPendingStorageWork() {
    return this.pending > 0;
  }

  // Trashing only marks active rows, so unlike restore it needs no ordering against purges; its
  // write transaction alone orders it with draft rewrites.

  /** Trash the logical file that owns this version, with all its versions. */
  async trashFile(entryId: FileEntryId, signal?: AbortSignal) {
    const ids = await this.files.trashFileEntry(entryId, false, signal);
    for (const id of ids) notifyFileChange(id);
    return ids.length > 0;
  }

  /** Trash a folder with its active subtree. */
  async trashFolder(id: string, signal?: AbortSignal) {
    for (const entryId of await this.files.trashFolder(id, signal)) notifyFileChange(entryId);
  }

  restore(kind: TrashKind, id: string, signal?: AbortSignal) {
    return this.mutate(async () => {
      const restored = await this.entries.restore(kind, id, signal);
      for (const entryId of restored) notifyFileChange(entryId);
    });
  }

  delete(kind: TrashKind, id: string) {
    return this.mutate(async () => {
      await this.purge(await this.entries.get(kind, id));
    });
  }

  empty() {
    return this.mutate(async () => {
      const failures: unknown[] = [];
      for (const item of await this.entries.candidates()) {
        try {
          await this.purge(item);
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length)
        throw new AggregateError(failures, 'Some trash items could not be removed');
    });
  }

  sweep() {
    return this.mutate(async () => {
      for (const item of await this.entries.candidates(Date.now() - TRASH_RETENTION_MS)) {
        if (this.stopped) break;
        try {
          await this.purge(item);
        } catch (error) {
          logger.warn('Failed to remove an expired trash item', error as Error);
        }
      }
    });
  }

  private requestSweep() {
    if (this.stopped || storageMutationGate.isFrozen || this.pending) return;
    void this.sweep().catch((error: unknown) =>
      logger.warn('Trash sweep deferred', error as Error),
    );
  }

  private async purge(item: TrashItem) {
    storageMutationGate.assertWritable();
    const entries = await this.files.purge(item);
    for (const entry of entries ?? []) deleteInternalEntryFiles(entry);
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    storageMutationGate.assertWritable();
    if (this.stopped) return Promise.reject(new Error('Trash runtime has stopped'));
    this.pending += 1;
    const result = this.tail
      .then(() => {
        storageMutationGate.assertWritable();
        return operation();
      })
      .finally(() => {
        this.pending -= 1;
      });
    this.tail = result.catch(() => {});
    return result;
  }

  protected override async onStop() {
    this.stopped = true;
    await this.tail;
  }
}
