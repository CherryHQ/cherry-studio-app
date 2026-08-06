/**
 * Job runtime test harness: the shared data-layer DB harness (re-exported)
 * plus runtime factories and test handler factories.
 */
import type { DatabaseSync } from 'node:sqlite';

import type { Database } from '@/backend/data/db/DbService';
import { createTestDb, type TestDb } from '@/backend/data/services/__tests__/_testDb';
import { JobService } from '@/backend/data/services/JobService';

import { createJobRuntime, type JobRuntime, type JobRuntimeOptions } from '../JobRuntime';
import type { EnqueueOptions, JobHandle, JobHandler } from '../types';

export {
  applyMigrations,
  createTestDb,
  type TestDb,
} from '@/backend/data/services/__tests__/_testDb';

export type TestRuntime = {
  db: TestDb;
  jobService: JobService;
  runtime: JobRuntime;
};

export function createTestRuntime(
  sqlite: DatabaseSync,
  handlers: readonly (readonly [string, JobHandler])[],
  overrides: Partial<Omit<JobRuntimeOptions, 'dbService' | 'handlers' | 'jobService'>> = {},
): TestRuntime {
  const db = createTestDb(sqlite);
  const jobService = new JobService(db.dbService);
  const runtime = createJobRuntime({
    dbService: db.dbService,
    handlers,
    jobService,
    ...overrides,
  });
  return { db, jobService, runtime };
}

/**
 * Production `JobRegistry` is empty in this PR (`JobType = never`), so tests
 * enqueue through this cast helper instead of polluting the registry with
 * declaration merging (desktop smoke tests use the same `as never` approach).
 */
export function enqueueTest(
  runtime: JobRuntime,
  type: string,
  input: unknown,
  opts?: EnqueueOptions,
): Promise<JobHandle> {
  return runtime.enqueue(type as never, input as never, opts);
}

/** Same cast rationale as {@link enqueueTest}, for the transactional variant. */
export function enqueueTxTest(
  runtime: JobRuntime,
  tx: Database,
  type: string,
  input: unknown,
  opts?: EnqueueOptions,
): Promise<JobHandle> {
  return runtime.enqueueTx(tx, type as never, input as never, opts);
}

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 3000,
  intervalMs = 10,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await condition()) return;
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** True if the promise settles within `ms`; use to assert "never settles". */
export async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  const sentinel = Symbol('still-pending');
  const winner = await Promise.race([
    promise.then(
      () => 'settled' as const,
      () => 'settled' as const,
    ),
    new Promise((resolve) => setTimeout(() => resolve(sentinel), ms)),
  ]);
  return winner !== sentinel;
}

export function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = () => reject((signal.reason as Error | undefined) ?? new Error('AbortError'));
    if (signal.aborted) {
      fail();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        fail();
      },
      { once: true },
    );
  });
}

export type Gate = {
  promise: Promise<void>;
  release: () => void;
};

export function makeGate(): Gate {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

export type EchoInput = { message: string; sleepMs?: number };

/** Signal-respecting handler; completes with `echo: <message>`. */
export function makeEchoHandler(overrides: Partial<JobHandler<EchoInput>> = {}): JobHandler {
  return {
    cancelTimeoutMs: 200,
    executionClass: 'foreground-only',
    recovery: 'abandon',
    async execute(ctx) {
      const input = ctx.input as EchoInput;
      ctx.reportProgress(25, { stage: 'starting' });
      await sleepWithSignal(input.sleepMs ?? 5, ctx.signal);
      ctx.reportProgress(100, { stage: 'done' });
      return { echoed: `echo: ${input.message}` };
    },
    ...overrides,
  } as JobHandler;
}

/** Signal-respecting handler parked on a gate; use to hold concurrency slots. */
export function makeHoldHandler(gate: Gate, overrides: Partial<JobHandler> = {}): JobHandler {
  return {
    cancelTimeoutMs: 200,
    executionClass: 'foreground-only',
    recovery: 'retry',
    async execute(ctx) {
      await Promise.race([
        gate.promise,
        new Promise((_, reject) => {
          const fail = () =>
            reject((ctx.signal.reason as Error | undefined) ?? new Error('AbortError'));
          if (ctx.signal.aborted) fail();
          else ctx.signal.addEventListener('abort', fail, { once: true });
        }),
      ]);
      return 'held-done';
    },
    ...overrides,
  } as JobHandler;
}

/** Ignores the abort signal entirely; settles only when the gate releases. */
export function makeStubbornHandler(gate: Gate, overrides: Partial<JobHandler> = {}): JobHandler {
  return {
    cancelTimeoutMs: 50,
    executionClass: 'foreground-only',
    recovery: 'abandon',
    async execute() {
      await gate.promise;
      return 'stubborn-late-output';
    },
    ...overrides,
  } as JobHandler;
}
