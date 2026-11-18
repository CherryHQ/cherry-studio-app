import type { MemoryMutationSource } from './memoryBackups';
import type { MemoryEntry, MemoryUse } from './memoryEntries';
import { MemoryError } from './memoryFiles';
import type { MemoryPlatform } from './memoryPlatform';
import {
  MemoryStore,
  type MemoryAccess,
  type MemoryApproval,
  type MemoryCommitResult,
  type MemoryMutation,
} from './MemoryStore';

export type MemoryScope = { kind: 'shared' } | { kind: 'private'; agentId: string };
export const memoryScopeKey = (scope: MemoryScope): string =>
  scope.kind === 'shared' ? 'shared' : 'agent/' + scope.agentId;
export interface MemoryAuthority extends MemoryAccess {
  readonly scope: MemoryScope;
  assertWritable(): void;
  assertHistory?(protection: string | null): Promise<void>;
}
export interface MemoryServiceOptions {
  platform: MemoryPlatform;
  roots(scope: MemoryScope): { active: string; backup: string };
  changed?(scope: MemoryScope, source: MemoryMutationSource, result: MemoryCommitResult): void;
}

/** The host owns this instance, callers own sessions; neither owns a second copy of the files. */
export class MemoryService {
  private readonly stores = new Map<string, Promise<MemoryStore>>();
  private readonly snapshots = new Map<string, Promise<{ content: string; truncated: boolean }>>();
  private readonly work = new Set<Promise<unknown>>();
  private closed = false;
  private generation = 0;

  constructor(private readonly options: MemoryServiceOptions) {}

  open(authority: MemoryAuthority, source: MemoryMutationSource = 'controlled') {
    authority.assertAuthorized();
    const scope = Object.freeze({ ...authority.scope });
    const generation = this.generation;
    let disposed = false;
    const access: MemoryAccess = {
      assertAuthorized: () => {
        if (disposed || this.closed || generation !== this.generation)
          throw new MemoryError('invalid-receipt', 'Memory session expired');
        return authority.assertAuthorized();
      },
    };
    const validations = new Map<string, () => Promise<void>>();
    const validateModelReads = async () => {
      for (const validate of new Set(validations.values())) await validate();
      access.assertAuthorized();
    };
    const run = <T>(operation: (store: MemoryStore) => Promise<T>, write = false): Promise<T> => {
      access.assertAuthorized();
      if (write) authority.assertWritable();
      const task = this.store(scope).then(async (store) => {
        access.assertAuthorized();
        if (write) authority.assertWritable();
        return operation(store);
      });
      this.work.add(task);
      void task.finally(() => this.work.delete(task)).catch(() => {});
      return task;
    };
    const approve: MemoryApproval = async () => () => undefined;
    const guarded =
      (approval: MemoryApproval): MemoryApproval =>
      async (changes) => {
        const validate = await approval(changes);
        return () => {
          access.assertAuthorized();
          authority.assertWritable();
          return validate();
        };
      };
    const changed = (result: MemoryCommitResult, origin: MemoryMutationSource) => {
      if (result.batchId) validations.clear();
      this.options.changed?.(scope, origin, result);
      return result;
    };
    const readMany = (
      targets: readonly string[],
      purpose: MemoryUse = 'current',
      sources?: readonly MemoryEntry['sources'][number][],
    ) =>
      run(async (store) => {
        const result = await store.modelReads(access, targets, purpose, sources);
        access.assertAuthorized();
        for (const file of result.reads) validations.set(file.path, result.validate);
        return result.reads;
      });
    return {
      scope,
      assertAuthorized: access.assertAuthorized,
      dispose() {
        disposed = true;
        validations.clear();
      },
      validateModelReads,
      assertRuntimeSafe: () =>
        run((store) => store.assertRuntimeSafe(access, authority.assertHistory)),
      list: () => run((store) => store.list(access)),
      entry: () => run((store) => store.entry(access)),
      readMany,
      async read(
        target: string,
        purpose: MemoryUse = 'current',
        sources?: readonly MemoryEntry['sources'][number][],
      ) {
        const [file] = await readMany([target], purpose, sources);
        access.assertAuthorized();
        return file!;
      },
      commit: (
        mutations: readonly MemoryMutation[],
        approval: MemoryApproval = approve,
        readReceipts?: readonly string[],
      ) =>
        run(
          async (store) =>
            changed(
              await store.commit(access, mutations, source, guarded(approval), {
                readReceipts,
                validateReads: validateModelReads,
              }),
              source,
            ),
          true,
        ),
      previewClear: () => run((store) => store.previewClear(access)),
      clear: (token: string, approval: MemoryApproval = approve) =>
        run(
          async (store) => changed(await store.clear(access, token, guarded(approval)), 'clear'),
          true,
        ),
      previewRecovery: () => run((store) => store.previewRecovery(access)),
      recover: (token: string, approval: MemoryApproval = approve) =>
        run(
          async (store) =>
            changed(await store.recover(access, token, guarded(approval)), 'recovery'),
          true,
        ),
    };
  }

  async entrySnapshot(conversationId: string, session: MemorySession) {
    await session.assertRuntimeSafe();
    const key = JSON.stringify([conversationId, memoryScopeKey(session.scope)]);
    let snapshot = this.snapshots.get(key);
    if (!snapshot) {
      snapshot = session.entry();
      this.snapshots.set(key, snapshot);
      void snapshot.catch(() => {
        if (this.snapshots.get(key) === snapshot) this.snapshots.delete(key);
      });
    }
    const value = await snapshot;
    await session.assertRuntimeSafe();
    return value;
  }

  invalidateAll() {
    this.generation++;
    this.snapshots.clear();
    for (const pending of this.stores.values())
      void pending.then((store) => store.invalidate()).catch(() => {});
  }
  hasPendingStorageWork = () => this.work.size > 0;
  async close() {
    this.closed = true;
    this.invalidateAll();
    await Promise.allSettled([...this.work]);
    this.stores.clear();
  }

  private store(scope: MemoryScope): Promise<MemoryStore> {
    const key = memoryScopeKey(scope);
    let pending = this.stores.get(key);
    if (!pending) {
      const roots = this.options.roots(scope);
      const store = new MemoryStore(roots.active, roots.backup, this.options.platform);
      pending = store.initialize().then(() => store);
      this.stores.set(key, pending);
      void pending.catch(() => {
        if (this.stores.get(key) === pending) this.stores.delete(key);
      });
    }
    return pending;
  }
}
export type MemorySession = ReturnType<MemoryService['open']>;
