import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { JOB_ERROR_CODES, type JobProgress } from '@cherrystudio/universal/data/api/schemas/jobs';

import { uninstallTestHost } from '@/backend/core/application/testHost';
import type { Database } from '@/backend/data/db/DbService';
import { type InsertJobRow, jobTable } from '@/backend/data/db/schemas/job';
import { JobService } from '@/backend/data/services/JobService';

import { createJobRuntime } from '../JobRuntime';
import { GC_TERMINAL_TTL_MS, type JobHandler, MAX_INPUT_BYTES } from '../types';
import {
  createTestDb,
  createTestRuntime,
  enqueueTest,
  makeEchoHandler,
  makeGate,
  makeHoldHandler,
  settlesWithin,
  type TestRuntime,
  waitFor,
} from './_helpers';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

/** Fails the first `failures` executions, then completes with the attempt. */
function makeFlakyHandler(failures: number): JobHandler {
  let remaining = failures;
  return {
    executionClass: 'foreground-only',
    recovery: 'abandon',
    async execute(ctx) {
      if (remaining > 0) {
        remaining -= 1;
        throw new Error('flaky failure');
      }
      return { succeededOnAttempt: ctx.attempt };
    },
  } as JobHandler;
}

async function insertJob(tx: Database, overrides: Partial<InsertJobRow> = {}) {
  const [row] = await tx
    .insert(jobTable)
    .values({
      input: {},
      queue: 'q',
      scheduledAt: 0,
      status: 'pending',
      type: 't',
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

describe('JobRuntime', () => {
  let sqlite: DatabaseSync | undefined;
  let ctx: TestRuntime | undefined;

  async function setup(
    handlers: Parameters<typeof createTestRuntime>[1],
    overrides?: Parameters<typeof createTestRuntime>[2],
  ) {
    sqlite = new DatabaseSync(':memory:');
    ctx = await createTestRuntime(sqlite, handlers, overrides);
    return ctx;
  }

  afterEach(async () => {
    await ctx?.runtime.dispose();
    await uninstallTestHost();
    sqlite?.close();
    ctx = undefined;
    sqlite = undefined;
  });

  it('rejects duplicate handler registrations at construction', () => {
    const db = new DatabaseSync(':memory:');
    sqlite = db;
    // Built directly rather than through `createTestRuntime`: the point is that
    // the throw happens synchronously while constructing, and the harness is
    // async because it installs a host first.
    expect(() =>
      createJobRuntime({
        dbService: createTestDb(db).dbService,
        handlers: [
          ['internal.echo', makeEchoHandler()],
          ['internal.echo', makeEchoHandler()],
        ],
        jobService: new JobService(),
      }),
    ).toThrow(/Duplicate job handler/);
  });

  it('runs an echo job end to end and persists the terminal snapshot', async () => {
    const progressEvents: JobProgress[] = [];
    const { jobService, runtime } = await setup([['internal.echo', makeEchoHandler()]], {
      onProgress: (_jobId, progress) => progressEvents.push(progress),
    });

    const handle = await enqueueTest(runtime, 'internal.echo', { message: 'hi' });
    expect(handle.snapshot.status).toBe('pending');
    expect(handle.snapshot.queue).toBe('internal.echo');

    const finished = await handle.finished;
    expect(finished.status).toBe('completed');
    expect(finished.output).toEqual({ echoed: 'echo: hi' });
    expect(finished.error).toBeNull();
    expect(finished.startedAt).not.toBeNull();
    expect(finished.finishedAt).not.toBeNull();

    const persisted = await jobService.getById(handle.id);
    expect(persisted?.status).toBe('completed');
    expect(persisted?.output).toEqual({ echoed: 'echo: hi' });
    expect(progressEvents.map((p) => p.progress)).toEqual([25, 100]);
  });

  it('validates type, payload size, and numeric options at enqueue', async () => {
    const { runtime } = await setup([['internal.echo', makeEchoHandler()]]);
    await expect(enqueueTest(runtime, 'internal.ghost', {})).rejects.toMatchObject({
      code: JOB_ERROR_CODES.UNKNOWN_TYPE,
    });
    await expect(
      enqueueTest(runtime, 'internal.echo', { blob: 'x'.repeat(MAX_INPUT_BYTES + 1) }),
    ).rejects.toMatchObject({ code: JOB_ERROR_CODES.PAYLOAD_TOO_LARGE });
    await expect(
      enqueueTest(runtime, 'internal.echo', { message: 'x' }, { maxAttempts: 0 }),
    ).rejects.toMatchObject({ code: 'JOB_INVALID_MAX_ATTEMPTS' });
    await expect(
      enqueueTest(runtime, 'internal.echo', { message: 'x' }, { timeoutMs: 0 }),
    ).rejects.toMatchObject({ code: 'JOB_INVALID_TIMEOUT_MS' });
  });

  it('keeps a future job delayed until the clock reaches scheduledAt', async () => {
    let clock = 1_000_000;
    const { jobService, runtime } = await setup([['internal.echo', makeEchoHandler()]], {
      now: () => clock,
    });

    const handle = await enqueueTest(
      runtime,
      'internal.echo',
      { message: 'later' },
      { scheduledAt: clock + 60_000 },
    );
    expect(handle.snapshot.status).toBe('delayed');

    expect((await runtime.pump({ reason: 'manual' })).claimed).toBe(0);
    expect((await jobService.getById(handle.id))?.status).toBe('delayed');

    clock += 60_000;
    expect((await runtime.pump({ reason: 'manual' })).claimed).toBe(1);
    expect((await handle.finished).status).toBe('completed');
  });

  it('deduplicates by idempotency key: same id, shared finished promise', async () => {
    let clock = 1_000_000;
    const { runtime } = await setup([['internal.echo', makeEchoHandler()]], { now: () => clock });
    const opts = { idempotencyKey: 'once', scheduledAt: clock + 60_000 };
    const first = await enqueueTest(runtime, 'internal.echo', { message: 'a' }, opts);
    const second = await enqueueTest(runtime, 'internal.echo', { message: 'b' }, opts);
    expect(second.id).toBe(first.id);
    expect(second.finished).toBe(first.finished);
  });

  it('caps running jobs globally and refills the freed slot on settle', async () => {
    const gate = makeGate();
    const { jobService, runtime } = await setup([['internal.hold', makeHoldHandler(gate)]]);
    const handles = await Promise.all(
      ['q1', 'q2', 'q3'].map((queue) => enqueueTest(runtime, 'internal.hold', {}, { queue })),
    );

    await waitFor(async () => {
      const statuses = await Promise.all(handles.map((h) => jobService.getById(h.id)));
      return (
        statuses.filter((s) => s?.status === 'running').length === 2 &&
        statuses.filter((s) => s?.status === 'pending').length === 1
      );
    });

    gate.release();
    const finals = await Promise.all(handles.map((h) => h.finished));
    expect(finals.map((f) => f.status)).toEqual(['completed', 'completed', 'completed']);
    expect(finals[0].output).toBe('held-done');
  });

  it('serializes jobs sharing a queue at defaultConcurrency 1', async () => {
    const gate = makeGate();
    const { jobService, runtime } = await setup([['internal.hold', makeHoldHandler(gate)]]);
    const first = await enqueueTest(runtime, 'internal.hold', {});
    const second = await enqueueTest(runtime, 'internal.hold', {});

    await waitFor(async () => {
      const statuses = await Promise.all(
        [first, second].map((h) => jobService.getById(h.id).then((s) => s?.status)),
      );
      return statuses.filter((s) => s === 'running').length === 1 && statuses.includes('pending');
    });

    gate.release();
    const finals = await Promise.all([first.finished, second.finished]);
    expect(finals.map((f) => f.status)).toEqual(['completed', 'completed']);
  });

  it('retries with backoff, increments attempt, and succeeds on re-claim', async () => {
    let clock = 1_000_000;
    const { jobService, runtime } = await setup([['internal.flaky', makeFlakyHandler(1)]], {
      now: () => clock,
    });

    const handle = await enqueueTest(runtime, 'internal.flaky', {});
    await waitFor(async () => (await jobService.getById(handle.id))?.status === 'delayed');

    const delayed = await jobService.getById(handle.id);
    if (!delayed) throw new Error('job row missing');
    expect(delayed.attempt).toBe(1);
    // DEFAULT_RETRY_POLICY: exponential, base 1000 — attempt 1 waits the raw base.
    expect(Date.parse(delayed.scheduledAt)).toBe(clock + 1000);
    expect(delayed.error?.code).toBe(JOB_ERROR_CODES.HANDLER_THREW);

    clock += 1000;
    await runtime.pump({ reason: 'manual' });
    const finished = await handle.finished;
    expect(finished.status).toBe('completed');
    expect(finished.attempt).toBe(1);
    expect(finished.output).toEqual({ succeededOnAttempt: 1 });
  });

  it('fails terminally once attempts are exhausted', async () => {
    let clock = 1_000_000;
    const { jobService, runtime } = await setup([['internal.flaky', makeFlakyHandler(99)]], {
      now: () => clock,
    });

    const handle = await enqueueTest(runtime, 'internal.flaky', {}, { maxAttempts: 2 });
    await waitFor(async () => (await jobService.getById(handle.id))?.status === 'delayed');

    clock += 1000;
    await runtime.pump({ reason: 'manual' });
    const finished = await handle.finished;
    expect(finished.status).toBe('failed');
    expect(finished.attempt).toBe(1);
    expect(finished.error?.code).toBe(JOB_ERROR_CODES.HANDLER_THREW);
    expect(finished.error?.retryable).toBe(true);
  });

  it('classifies a handler timeout via the sentinel abort reason', async () => {
    const { runtime } = await setup([['internal.echo', makeEchoHandler()]]);
    const handle = await enqueueTest(
      runtime,
      'internal.echo',
      { message: 'slow', sleepMs: 5000 },
      { maxAttempts: 1, timeoutMs: 30 },
    );
    const finished = await handle.finished;
    expect(finished.status).toBe('failed');
    expect(finished.error?.code).toBe(JOB_ERROR_CODES.HANDLER_TIMEOUT);
    expect(finished.error?.retryable).toBe(true);
  });

  it('never classifies by message text: a thrown "timeout" error is HANDLER_THREW', async () => {
    const liar: JobHandler = {
      executionClass: 'foreground-only',
      recovery: 'abandon',
      execute: async () => {
        throw new Error('request timeout');
      },
    } as JobHandler;
    const { runtime } = await setup([['internal.liar', liar]]);
    const handle = await enqueueTest(runtime, 'internal.liar', {}, { maxAttempts: 1 });
    const finished = await handle.finished;
    expect(finished.status).toBe('failed');
    expect(finished.error?.code).toBe(JOB_ERROR_CODES.HANDLER_THREW);
  });

  it('degrades to terminal failed when the retry persist fails', async () => {
    const gate = makeGate();
    const failing: JobHandler = {
      executionClass: 'foreground-only',
      recovery: 'abandon',
      async execute() {
        await gate.promise;
        throw new Error('boom');
      },
    } as JobHandler;
    const { db, jobService, runtime } = await setup([['internal.failing', failing]]);

    const handle = await enqueueTest(runtime, 'internal.failing', {});
    await waitFor(async () => (await jobService.getById(handle.id))?.status === 'running');
    // Drain the enqueue-triggered pump so the next write transaction is the
    // retry persist, then poison it.
    await runtime.pump({ reason: 'manual' });
    db.failNextWriteTx(new Error('disk io error'));

    gate.release();
    const finished = await handle.finished;
    expect(finished.status).toBe('failed');
    expect(finished.error?.retryable).toBe(true);
    expect(finished.error?.message).toContain('Retry persist failed');
    expect(finished.error?.message).toContain('boom');
  });

  it('coalesces concurrent pump requests into one loop plus one dirty rerun', async () => {
    const { jobService, runtime } = await setup([['internal.echo', makeEchoHandler()]]);
    const spy = jest.spyOn(jobService, 'promoteDelayedDueTx');
    await Promise.all([
      runtime.pump({ reason: 'manual' }),
      runtime.pump({ reason: 'manual' }),
      runtime.pump({ reason: 'manual' }),
    ]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('cold-start pump prunes terminal rows past the 7d TTL, keeping active ones', async () => {
    const clock = GC_TERMINAL_TTL_MS * 2;
    const { db, jobService, runtime } = await setup([['internal.echo', makeEchoHandler()]], {
      now: () => clock,
    });
    await insertJob(db.database, { finishedAt: 10, id: 'ancient', status: 'completed' });
    await insertJob(db.database, {
      finishedAt: clock - 1000,
      id: 'fresh',
      status: 'failed',
    });
    await insertJob(db.database, { id: 'ghost-active', status: 'running', type: 'ghost.job' });

    await runtime.pump({ reason: 'cold-start' });

    expect(await jobService.getById('ancient')).toBeNull();
    expect(await jobService.getById('fresh')).not.toBeNull();
    // Active rows are recovery's business (orphan sweep), never GC's.
    expect(await jobService.getById('ghost-active')).not.toBeNull();
  });

  it('runs startup recovery before the first claim', async () => {
    const { db, jobService, runtime } = await setup([
      ['internal.echo', makeEchoHandler({ recovery: 'retry' })],
    ]);
    await insertJob(db.database, {
      id: 'revive',
      input: { message: 'revived' },
      queue: 'internal.echo',
      status: 'running',
      type: 'internal.echo',
    });
    await insertJob(db.database, {
      cancelRequested: true,
      id: 'override',
      queue: 'internal.echo',
      status: 'running',
      type: 'internal.echo',
    });
    await insertJob(db.database, {
      id: 'orphan',
      queue: 'g',
      status: 'running',
      type: 'ghost.job',
    });

    await runtime.pump({ reason: 'cold-start' });
    await waitFor(async () => (await jobService.getById('revive'))?.status === 'completed');

    expect((await jobService.getById('revive'))?.output).toEqual({ echoed: 'echo: revived' });
    const override = await jobService.getById('override');
    expect(override?.status).toBe('cancelled');
    expect(override?.error?.code).toBe(JOB_ERROR_CODES.CANCELLED);
    const orphan = await jobService.getById('orphan');
    expect(orphan?.status).toBe('cancelled');
    expect(orphan?.error?.message).toContain('Orphan job');
  });

  it('leaves non-foreground execution classes pending (Phase 1 window filter)', async () => {
    const { jobService, runtime } = await setup([
      ['internal.bg', makeEchoHandler({ executionClass: 'bounded-background' })],
    ]);
    const handle = await enqueueTest(runtime, 'internal.bg', { message: 'later' });
    expect((await runtime.pump({ reason: 'manual' })).claimed).toBe(0);
    expect((await jobService.getById(handle.id))?.status).toBe('pending');
    expect(await settlesWithin(handle.finished, 50)).toBe(false);
  });

  it('resolves finished before onSettled completes, and swallows onSettled errors', async () => {
    const settledGate = makeGate();
    const events: string[] = [];
    const { runtime } = await setup([
      [
        'internal.echo',
        makeEchoHandler({
          onSettled: async (event) => {
            events.push(`onSettled:${event.status}`);
            await settledGate.promise;
            events.push('onSettled:end');
          },
        }),
      ],
      [
        'internal.grumpy',
        makeEchoHandler({
          onSettled: () => {
            throw new Error('settled boom');
          },
        }),
      ],
    ]);

    const handle = await enqueueTest(runtime, 'internal.echo', { message: 'hi' });
    // finished resolves while onSettled is still parked on its gate.
    const finished = await handle.finished;
    expect(finished.status).toBe('completed');
    expect(events).toContain('onSettled:completed');
    expect(events).not.toContain('onSettled:end');
    settledGate.release();
    await waitFor(() => events.includes('onSettled:end'));

    // A throwing onSettled neither fails the job nor wedges the runtime.
    const grumpy = await enqueueTest(runtime, 'internal.grumpy', { message: 'still fine' });
    expect((await grumpy.finished).status).toBe('completed');
  });
});
