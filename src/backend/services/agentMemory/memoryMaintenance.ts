import {
  DREAMING_INSTRUCTIONS,
  DreamingError,
  extractContextCandidates,
  fitDreamingInputs,
  memoryLineCount,
  memoryScopeKey,
  prepareDreamingPlan,
  type MemoryCommitResult,
  type MemoryModel,
  type MemoryMutationSource,
  type MemoryRead,
  type MemoryScope,
} from '@cherrystudio/memory';
import { eq } from 'drizzle-orm';
import { AppState } from 'react-native';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { subscribeDataApiChanges } from '@/backend/data/dataApiChanges';
import type { DbService } from '@/backend/data/db/DbService';
import { appStateTable } from '@/backend/data/db/schemas';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { JobRuntime } from '@/backend/services/jobs/JobRuntime';
import type { JobContext } from '@/backend/services/jobs/types';
import type { MemoryMaintenanceStatus } from '@/shared/contracts/memory';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { AgentMemoryService } from './AgentMemoryService';
import { MemoryHistory } from './memoryHistory';

declare module '@/backend/services/jobs/jobRegistry' {
  interface JobRegistry {
    'memory.maintain': { manual?: boolean };
  }
}
const logger = loggerService.withContext('MemoryMaintenance');
type FileState = {
  hash?: string | null;
  observed?: string | null;
  pendingSince?: number;
  edits: number;
  attempts?: number;
  attemptedAt?: number;
  blocked?: string | null;
  model?: string;
};
type Ticket = {
  agentId: string;
  sessionId: string;
  replyId: string;
  hash: string;
  revision: number;
  createdAt: number;
};
type ExtractionCursor = Pick<Ticket, 'replyId' | 'createdAt' | 'hash'> & {
  outcome: 'admitted' | 'completed' | 'failed' | 'skipped';
};

/** Mobile owns foreground scheduling, persistent progress and trusted completed-message admission. */
export function createMemoryMaintenance(deps: {
  db: DbService;
  memory: AgentMemoryService;
  preference: PreferenceService;
  jobs: JobRuntime;
  model(): Promise<MemoryModel>;
  isIdle(): boolean;
}) {
  const history = new MemoryHistory(deps.db);
  const queue: Ticket[] = [];
  const work = new Set<Promise<unknown>>();
  const scopeGenerations = new Map<string, number>();
  let boundary = Date.now();
  let generation = 0;
  let organizationGeneration = 0;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let subscriptions: (() => void)[] = [];
  let jobId: string | undefined;
  let scheduling = false;
  let manualPending = false;
  let active:
    | {
        key: string;
        purpose: 'extraction' | 'organization';
        controller: AbortController;
        check?: () => void;
      }
    | undefined;
  const track = <T>(task: Promise<T>) => {
    work.add(task);
    void task.finally(() => work.delete(task)).catch(() => {});
    return task;
  };
  async function readState<T>(key: string): Promise<T | undefined> {
    const [row] = await deps.db
      .getDb()
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.key, key))
      .limit(1);
    return row?.value as T | undefined;
  }
  async function saveState(key: string, value: unknown) {
    storageMutationGate.assertWritable();
    await deps.db.withWriteTx(async (tx) => {
      storageMutationGate.assertWritable();
      await tx
        .insert(appStateTable)
        .values({ key, value, description: 'Managed memory maintenance state' })
        .onConflictDoUpdate({ target: appStateTable.key, set: { value, updatedAt: Date.now() } });
    });
  }
  const fileKey = (scope: MemoryScope, path: string) =>
    'memory.file:' + JSON.stringify([memoryScopeKey(scope), path]);
  async function state(scope: MemoryScope, path: string): Promise<FileState> {
    return (await readState<FileState>(fileKey(scope, path))) ?? { edits: 0 };
  }
  const agentRevision = (agentId: string) =>
    deps.db
      .getSqlite()
      .getFirstSync<{ updated_at: number; shared_memory_enabled: number }>(
        'SELECT updated_at,shared_memory_enabled FROM agent WHERE id = ? AND deleted_at IS NULL',
        agentId,
      );
  const idle = () => AppState.currentState === 'active' && deps.isIdle();
  const enabled = () => deps.preference.readCached('memory.generate.enabled');
  function invalidateExtraction() {
    generation++;
    boundary = Date.now();
    queue.length = 0;
    if (active?.purpose === 'extraction') active.controller.abort();
  }
  function invalidateOrganization() {
    organizationGeneration++;
    if (active?.purpose === 'organization') active.controller.abort();
  }
  function invalidate() {
    invalidateExtraction();
    invalidateOrganization();
  }
  async function updateFileState(
    scope: MemoryScope,
    path: string,
    update: (current: FileState) => FileState,
  ) {
    storageMutationGate.assertWritable();
    return deps.db.withWriteTx(async (tx) => {
      storageMutationGate.assertWritable();
      const key = fileKey(scope, path);
      const [row] = await tx
        .select()
        .from(appStateTable)
        .where(eq(appStateTable.key, key))
        .limit(1);
      const value = update((row?.value as FileState) ?? { edits: 0 });
      await tx
        .insert(appStateTable)
        .values({ key, value, description: 'Memory file processing progress' })
        .onConflictDoUpdate({ target: appStateTable.key, set: { value, updatedAt: Date.now() } });
      return value;
    });
  }

  async function writeCursor(sessionId: string, value: ExtractionCursor, admit = false) {
    storageMutationGate.assertWritable();
    return deps.db.withWriteTx(async (tx) => {
      storageMutationGate.assertWritable();
      const key = 'memory.cursor:' + sessionId;
      const [row] = await tx
        .select()
        .from(appStateTable)
        .where(eq(appStateTable.key, key))
        .limit(1);
      const previous = row?.value as ExtractionCursor | undefined;
      if (
        previous &&
        (value.createdAt < previous.createdAt ||
          (value.createdAt === previous.createdAt && value.replyId < previous.replyId) ||
          (admit && value.replyId === previous.replyId))
      )
        return false;
      await tx
        .insert(appStateTable)
        .values({
          key,
          value,
          description: 'Memory extraction admission and outcome; no message bodies',
        })
        .onConflictDoUpdate({ target: appStateTable.key, set: { value, updatedAt: Date.now() } });
      return true;
    });
  }

  async function schedule() {
    if (stopped || scheduling || jobId || !idle()) return;
    if (!queue.length && !manualPending && !deps.preference.readCached('memory.organize.enabled'))
      return;
    scheduling = true;
    try {
      await saveState('memory.maintenance:status', {
        ...(await readState<MemoryMaintenanceStatus>('memory.maintenance:status')),
        status: 'queued',
      });
      const handle = await deps.jobs.enqueue(
        'memory.maintain',
        { manual: manualPending },
        { queue: 'memory', maxAttempts: 1, timeoutMs: 120_000 },
      );
      jobId = handle.id;
      void handle.finished
        .then(() => {
          if (jobId === handle.id) jobId = undefined;
        })
        .catch(() => {});
    } finally {
      scheduling = false;
    }
  }

  async function extraction(ticket: Ticket, signal: AbortSignal) {
    const scope = { kind: 'shared' } as const;
    const key = memoryScopeKey(scope);
    const acceptedGeneration = generation;
    const scopeGeneration = scopeGenerations.get(key) ?? 0;
    const assertCurrent = () => {
      signal.throwIfAborted();
      const row = agentRevision(ticket.agentId);
      if (
        stopped ||
        !idle() ||
        !enabled() ||
        acceptedGeneration !== generation ||
        scopeGeneration !== (scopeGenerations.get(key) ?? 0) ||
        row?.updated_at !== ticket.revision ||
        !row.shared_memory_enabled
      )
        throw new DreamingError('conflict');
      if (
        history.completedRange(ticket.agentId, ticket.replyId, Math.max(boundary, ticket.revision))
          ?.hash !== ticket.hash
      )
        throw new DreamingError('conflict');
    };
    assertCurrent();
    const range = history.completedRange(
      ticket.agentId,
      ticket.replyId,
      Math.max(boundary, ticket.revision),
    )!;
    const session = deps.memory.maintenanceSession(scope, 'extraction', assertCurrent);
    if (active) active.check = session.assertAuthorized;
    try {
      const paths = await session.list();
      if (paths.length > 40) throw new DreamingError('budget');
      const files = await session.readMany(paths, 'extraction');
      let bytes = 0;
      for (const file of files) {
        bytes += new TextEncoder().encode(file.content ?? '').length;
        if (bytes > 32_000 || !file.receipt) throw new DreamingError('budget');
      }
      const model = await deps.model();
      const modelId = deps.preference.readCached('agent.default_model_id');
      const validate = () => {
        assertCurrent();
        if (deps.preference.readCached('agent.default_model_id') !== modelId)
          throw new DreamingError('model');
      };
      const result = await extractContextCandidates(
        range,
        files,
        signal,
        validate,
        model,
        Date.now,
      );
      const additions = result.candidates.filter(
        (candidate) => candidate.scope === 'personal' && candidate.action === 'add',
      );
      if (!additions.length) return false;
      const original =
        files.find((file) => file.path === 'MEMORY.md') ??
        (await session.read('MEMORY.md', 'extraction'));
      if (!original.receipt) throw new DreamingError('conflict');
      // Candidates were reconciled together; never replace or silently correct existing facts.
      const text = additions.map((candidate) => '- ' + candidate.text).join('\n');
      const content =
        (original.content
          ? original.content + (original.content.endsWith('\n') ? '\n' : '\n\n')
          : '') +
        text +
        '\n';
      validate();
      const saved = await session.commit(
        [{ kind: 'write', receipt: original.receipt, content }],
        async () => () => {
          validate();
          return undefined;
        },
        files.map((file) => file.receipt),
      );
      if (
        saved.error ||
        saved.files.some((file) => !['applied', 'unchanged'].includes(file.outcome))
      )
        throw new DreamingError('backup');
      return true;
    } finally {
      session.dispose();
    }
  }

  async function organize(scope: MemoryScope, force: boolean, signal: AbortSignal) {
    const key = memoryScopeKey(scope);
    const initialGeneration = organizationGeneration;
    const scopeGeneration = scopeGenerations.get(key) ?? 0;
    const assertCurrent = () => {
      signal.throwIfAborted();
      if (
        stopped ||
        !idle() ||
        initialGeneration !== organizationGeneration ||
        scopeGeneration !== (scopeGenerations.get(key) ?? 0) ||
        (!force && !deps.preference.readCached('memory.organize.enabled'))
      )
        throw new DreamingError('conflict');
    };
    const session = deps.memory.maintenanceSession(scope, 'dreaming', assertCurrent);
    if (active) active.check = session.assertAuthorized;
    try {
      assertCurrent();
      const paths = await session.list();
      const topics = paths.filter((path) => path !== 'MEMORY.md');
      const cursorKey = 'memory.scan:' + key;
      const cursor = (await readState<{ index: number }>(cursorKey))?.index ?? 0;
      const rotated = topics.length
        ? [
            ...topics.slice(cursor % topics.length),
            ...topics.slice(0, cursor % topics.length),
          ].slice(0, 9)
        : [];
      const files = await session.readMany(['MEMORY.md', ...rotated]);
      const entry = files[0]!;
      if (!entry.receipt) return false;
      const candidates: MemoryRead[] = [entry];
      const states = new Map<string, FileState>();
      let eligible = force;
      await saveState(cursorKey, {
        index: topics.length ? (cursor + rotated.length) % topics.length : 0,
      });
      for (const file of files) {
        const path = file.path;
        if (!file.receipt) continue;
        const previous = await state(scope, path);
        const progress = await updateFileState(scope, path, (current) => {
          if (current.observed !== previous.observed || current.observed === file.hash)
            return current;
          return {
            ...current,
            observed: file.hash,
            pendingSince: current.pendingSince ?? Date.now(),
            attempts: 0,
            blocked: undefined,
          };
        });
        if (progress.observed !== file.hash) continue;
        const changed = progress.hash !== file.hash;
        const warning =
          new TextEncoder().encode(file.content ?? '').length >= 20_000 ||
          (path === 'MEMORY.md' && memoryLineCount(file.content ?? '') >= 160);
        const ready =
          changed &&
          (progress.edits >= 10 ||
            Date.now() - (progress.pendingSince ?? Date.now()) >= 7 * 86400_000 ||
            warning);
        eligible ||= ready;
        states.set(path, progress);
        if (path !== 'MEMORY.md' && candidates.length < 40 && (force || ready))
          candidates.push(file);
      }
      if (!eligible || !candidates.some((file) => file.content?.trim())) return false;
      const model = await deps.model();
      const modelId = deps.preference.readCached('agent.default_model_id');
      const usable = candidates.filter(
        (file, index) =>
          index === 0 ||
          force ||
          states.get(file.path)?.blocked !== file.hash ||
          states.get(file.path)?.model !== model.id,
      );
      if (
        !force &&
        states.get('MEMORY.md')?.blocked === entry.hash &&
        states.get('MEMORY.md')?.model === model.id
      )
        return false;
      let batch: ReturnType<typeof fitDreamingInputs>;
      try {
        batch = fitDreamingInputs(usable, model);
      } catch (error) {
        await updateFileState(scope, 'MEMORY.md', (current) =>
          current.observed === entry.hash
            ? { ...current, blocked: entry.hash, model: model.id }
            : current,
        );
        throw error;
      }
      const inputs = batch.inputs;
      if (
        !force &&
        inputs.every((file) => {
          const item = states.get(file.path);
          return (
            item &&
            (item.hash === file.hash ||
              (item.attempts ?? 0) >= 2 ||
              (item.attemptedAt ?? 0) + 600_000 > Date.now())
          );
        })
      )
        return false;
      for (const unfit of batch.unfit) {
        await updateFileState(scope, unfit.path, (current) =>
          current.observed === unfit.hash
            ? { ...current, blocked: unfit.hash, model: model.id }
            : current,
        );
      }
      for (const file of inputs) {
        await updateFileState(scope, file.path, (current) =>
          current.observed === file.hash
            ? { ...current, attempts: (current.attempts ?? 0) + 1, attemptedAt: Date.now() }
            : current,
        );
      }
      assertCurrent();
      const output = await model.generate({
        instructions: DREAMING_INSTRUCTIONS,
        text: batch.prompt,
        signal,
        maxOutputTokens: batch.outputTokens,
      });
      if (output.finishReason !== 'stop' || new TextEncoder().encode(output.text).length > 550_000)
        throw new DreamingError('output');
      assertCurrent();
      if (deps.preference.readCached('agent.default_model_id') !== modelId)
        throw new DreamingError('model');
      const plan = await prepareDreamingPlan(output.text, inputs, paths, session);
      const saved = await session.commit(
        plan.mutations,
        async () => () => {
          assertCurrent();
          return undefined;
        },
        [...plan.reads.values()].map((file) => file.receipt),
      );
      if (
        saved.error ||
        saved.files.some((file) => !['applied', 'unchanged'].includes(file.outcome))
      )
        throw new DreamingError('backup');
      const processed = new Map(inputs.map((file) => [file.path, file.hash]));
      for (const file of saved.files)
        if (file.outcome === 'applied' || file.outcome === 'unchanged')
          processed.set(file.path, file.hash);
      for (const [path, hash] of processed)
        await updateFileState(scope, path, (current) => ({
          ...current,
          hash,
          ...(current.observed === undefined ||
          current.observed === hash ||
          current.observed === inputs.find((file) => file.path === path)?.hash
            ? { observed: hash, edits: 0, attempts: 0, pendingSince: undefined, blocked: undefined }
            : {}),
        }));
      return true;
    } finally {
      session.dispose();
    }
  }

  return {
    start() {
      if (timer) return;
      stopped = false;
      boundary = Date.now();
      subscriptions = [
        deps.preference.subscribeChange('memory.generate.enabled')(invalidateExtraction),
        deps.preference.subscribeChange('memory.organize.enabled')(invalidateOrganization),
        deps.preference.subscribeChange('agent.default_model_id')(invalidate),
        subscribeDataApiChanges((paths) => {
          if (
            !paths.some((path) => path.startsWith('/agents') || path.startsWith('/agent-sessions'))
          )
            return;
          try {
            active?.check?.();
          } catch {
            active?.controller.abort();
          }
        }),
      ];
      void track(
        (async () => {
          const old = await readState<MemoryMaintenanceStatus>('memory.maintenance:status');
          if (old?.status === 'running' || old?.status === 'queued')
            await saveState('memory.maintenance:status', {
              status: 'cancelled',
              lastResult: { outcome: 'cancelled', finishedAt: Date.now() },
            });
        })(),
      ).catch((error) =>
        logger.warn('Could not reconcile memory maintenance state', error as Error),
      );
      const listener = AppState.addEventListener('change', (value) => {
        if (value !== 'active') active?.controller.abort();
      });
      subscriptions.push(() => listener.remove());
      timer = setInterval(() => {
        void track(schedule()).catch((error) =>
          logger.warn('Could not schedule memory maintenance', error as Error),
        );
      }, 60_000);
    },
    async stop() {
      stopped = true;
      invalidate();
      if (timer) clearInterval(timer);
      timer = undefined;
      subscriptions.forEach((dispose) => dispose());
      subscriptions = [];
      jobId = undefined;
      await Promise.allSettled([...work]);
    },
    hasPendingWork: () => work.size > 0 || Boolean(active) || scheduling || Boolean(jobId),
    status: () => readState<MemoryMaintenanceStatus>('memory.maintenance:status'),
    async organizeNow() {
      manualPending = true;
      await schedule();
    },
    changed(scope: MemoryScope, source: MemoryMutationSource, result: MemoryCommitResult) {
      if (stopped) return;
      if (source === 'clear' || source === 'recovery') {
        const key = memoryScopeKey(scope);
        scopeGenerations.set(key, (scopeGenerations.get(key) ?? 0) + 1);
        if (scope.kind === 'shared') {
          queue.length = 0;
          boundary = Date.now();
        }
        if (active?.key === key) active.controller.abort();
      }
      if (source !== 'controlled' && source !== 'extraction') return;
      if (source === 'controlled' && active?.key === memoryScopeKey(scope))
        active.controller.abort();
      void track(
        (async () => {
          for (const file of result.files)
            if (file.outcome === 'applied') {
              await updateFileState(scope, file.path, (item) => ({
                ...item,
                edits: item.edits + 1,
                observed: file.hash,
                pendingSince: item.pendingSince ?? Date.now(),
                attempts: 0,
                blocked: undefined,
              }));
            }
        })(),
      ).catch((error) => logger.warn('Could not persist memory progress', error as Error));
    },
    accept(sessionId: string, replyId: string) {
      if (stopped || !enabled()) return;
      void track(
        (async () => {
          const row = deps.db
            .getSqlite()
            .getFirstSync<{ agent_id: string }>(
              'SELECT agent_id FROM agent_session WHERE id = ?',
              sessionId,
            );
          if (!row) return;
          const revision = agentRevision(row.agent_id);
          if (!revision?.shared_memory_enabled) return;
          const range = history.completedRange(
            row.agent_id,
            replyId,
            Math.max(boundary, revision.updated_at),
          );
          if (!range) return;
          const last = range.messages.at(-1)!;
          const admitted = await writeCursor(
            sessionId,
            {
              replyId,
              createdAt: last.createdAt,
              hash: range.hash,
              outcome: queue.length >= 32 ? 'skipped' : 'admitted',
            },
            true,
          );
          if (!admitted || queue.length >= 32) return;
          queue.push({
            agentId: row.agent_id,
            sessionId,
            replyId,
            hash: range.hash,
            revision: revision.updated_at,
            createdAt: last.createdAt,
          });
          await schedule();
        })(),
      ).catch((error) => logger.warn('Could not admit memory extraction', error as Error));
    },
    execute(context: JobContext<{ manual?: boolean }>) {
      return track(
        (async () => {
          if (stopped || !idle()) return;
          const previous = await readState<MemoryMaintenanceStatus>('memory.maintenance:status');
          await saveState('memory.maintenance:status', { ...previous, status: 'running' });
          let ran = false;
          let taskSignal: AbortSignal | undefined;
          try {
            while (queue.length && enabled() && idle()) {
              const ticket = queue.shift()!;
              const controller = new AbortController();
              active = { key: 'shared', purpose: 'extraction', controller };
              taskSignal = AbortSignal.any([context.signal, controller.signal]);
              try {
                ran = (await extraction(ticket, taskSignal)) || ran;
                await writeCursor(ticket.sessionId, {
                  replyId: ticket.replyId,
                  createdAt: ticket.createdAt,
                  hash: ticket.hash,
                  outcome: 'completed',
                });
              } catch (error) {
                await writeCursor(ticket.sessionId, {
                  replyId: ticket.replyId,
                  createdAt: ticket.createdAt,
                  hash: ticket.hash,
                  outcome: 'failed',
                });
                throw error;
              } finally {
                active = undefined;
              }
            }
            const force = Boolean(context.input.manual || manualPending);
            manualPending = false;
            if (force || deps.preference.readCached('memory.organize.enabled')) {
              const scopes: MemoryScope[] = [{ kind: 'shared' }];
              if (!force)
                for (const row of deps.db
                  .getSqlite()
                  .getAllSync<{ id: string }>('SELECT id FROM agent WHERE deleted_at IS NULL'))
                  scopes.push({ kind: 'private', agentId: row.id });
              for (const scope of scopes) {
                if (!idle()) break;
                const controller = new AbortController();
                active = { key: memoryScopeKey(scope), purpose: 'organization', controller };
                taskSignal = AbortSignal.any([context.signal, controller.signal]);
                try {
                  ran = (await organize(scope, force, taskSignal)) || ran;
                } finally {
                  active = undefined;
                }
              }
            }
            await saveState('memory.maintenance:status', {
              status: 'idle',
              ...(ran
                ? { lastResult: { outcome: 'completed', finishedAt: Date.now() } }
                : { lastResult: previous?.lastResult }),
            });
          } catch (error) {
            const cancelled =
              context.signal.aborted || Boolean(taskSignal?.aborted) || !idle() || stopped;
            await saveState('memory.maintenance:status', {
              status: cancelled ? 'cancelled' : 'failed',
              lastResult: {
                outcome: cancelled ? 'cancelled' : 'failed',
                finishedAt: Date.now(),
                reason: error instanceof DreamingError ? error.reason : 'unavailable',
              },
            });
            throw error;
          }
        })(),
      );
    },
  };
}
export type MemoryMaintenanceRuntime = ReturnType<typeof createMemoryMaintenance>;
