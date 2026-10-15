import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import type { DbService } from '@/backend/data/db/DbService';
import { FileEntryService } from '@/backend/data/services/FileEntryService';
import { TrashService } from '@/backend/data/services/TrashService';
import { deleteInternalEntry, notifyFileChange } from '@/backend/services/file/fileStorage';
import { loggerService } from '@/shared/core/logger/LoggerService';
import {
  TRASH_RETENTION_MS,
  type TrashFilter,
  type TrashItem,
  type TrashKind,
} from '@/shared/data/api/schemas/trash';

const logger = loggerService.withContext('TrashRuntime');

@Injectable('TrashRuntime')
@DependsOn(['DbService'])
@ServicePhase(Phase.PostReady)
@AppStatePolicy('foreground-refresh')
export class TrashRuntime extends BaseService {
  readonly entries: TrashService;
  private readonly files: FileEntryService;
  private pending = 0;
  private stopped = false;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(dbService: DbService) {
    super();
    this.entries = new TrashService(dbService);
    this.files = new FileEntryService(dbService);
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

  restore(kind: TrashKind, id: string) {
    return this.mutate(async () => {
      await this.entries.restore(kind, id);
      this.notify({ kind, id });
    });
  }

  delete(kind: TrashKind, id: string) {
    return this.mutate(async () => {
      await this.purge(await this.entries.get(kind, id));
    });
  }

  empty(kind: TrashFilter = 'all') {
    return this.mutate(async () => {
      const failures: unknown[] = [];
      for (const item of await this.entries.candidates(kind)) {
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
      for (const item of await this.entries.candidates('all', Date.now() - TRASH_RETENTION_MS)) {
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
    const removed =
      item.kind === 'file'
        ? await deleteInternalEntry(this.files, item.id, item.deletedAt)
        : await this.entries.deleteSession(item);
    if (removed) this.notify(item);
  }

  private notify(item: Pick<TrashItem, 'kind' | 'id'>) {
    if (item.kind === 'file') notifyFileChange(item.id);
    publishDataApiChanges([
      '/trash',
      '/trash/summary',
      '/agent-sessions',
      `/agent-sessions/${item.id}`,
      `/agent-sessions/${item.id}/messages`,
      '/search/entities',
      '/search/contents',
    ]);
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
