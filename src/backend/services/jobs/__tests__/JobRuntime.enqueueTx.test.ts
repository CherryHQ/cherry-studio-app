import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { uninstallTestHost } from '@/backend/core/application/testHost';
import { jobTable } from '@/backend/data/db/schemas/job';

import type { JobHandle } from '../types';
import {
  createTestRuntime,
  enqueueTest,
  enqueueTxTest,
  makeEchoHandler,
  makeGate,
  makeHoldHandler,
  settlesWithin,
  type TestRuntime,
  waitFor,
} from './_helpers';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

describe('JobRuntime.enqueueTx', () => {
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
    await ctx?.runtime._doStop();
    await uninstallTestHost();
    sqlite?.close();
    ctx = undefined;
    sqlite = undefined;
  });

  it('commits the job with the caller transaction and executes it after commit', async () => {
    const { db, jobService, runtime } = await setup([['internal.echo', makeEchoHandler()]]);

    const handle = await db.dbService.withWriteTx(async (tx) => {
      // Stand-in for the business write sharing the transaction. Terminal
      // status keeps it out of startup recovery's way.
      await jobService.createTx(tx, {
        finishedAt: Date.now(),
        id: 'business-row',
        input: {},
        queue: 'audit',
        scheduledAt: Date.now(),
        status: 'completed',
        type: 'internal.echo',
      });
      return enqueueTxTest(runtime, tx, 'internal.echo', { message: 'tx' });
    });

    const finished = await handle.finished;
    expect(finished.status).toBe('completed');
    expect(finished.output).toEqual({ echoed: 'echo: tx' });
    expect(await jobService.getById('business-row')).not.toBeNull();
  });

  it('rollback leaves no row and the handle finished never settles (dropped, not rejected)', async () => {
    const { db, jobService, runtime } = await setup([['internal.echo', makeEchoHandler()]]);

    let handle: JobHandle | undefined;
    await expect(
      db.dbService.withWriteTx(async (tx) => {
        handle = await enqueueTxTest(runtime, tx, 'internal.echo', { message: 'doomed' });
        throw new Error('business validation failed');
      }),
    ).rejects.toThrow('business validation failed');

    if (!handle) throw new Error('handle not assigned');
    // The enqueueTx-triggered pump verifies committed truth and drops the
    // resolver; run one more to be deterministic about it having happened.
    await runtime.pump({ reason: 'manual' });
    expect(await jobService.getById(handle.id)).toBeNull();
    expect(await settlesWithin(handle.finished, 60)).toBe(false);
  });

  it('cleans up rolled-back rows even when the pump cannot claim (cap full)', async () => {
    const gate = makeGate();
    const { db, jobService, runtime } = await setup([
      ['internal.hold', makeHoldHandler(gate)],
      ['internal.echo', makeEchoHandler()],
    ]);
    const blockers = await Promise.all([
      enqueueTest(runtime, 'internal.hold', {}, { queue: 'q1' }),
      enqueueTest(runtime, 'internal.hold', {}, { queue: 'q2' }),
    ]);
    await waitFor(async () => {
      const statuses = await Promise.all(blockers.map((h) => jobService.getById(h.id)));
      return statuses.every((s) => s?.status === 'running');
    });

    let handle: JobHandle | undefined;
    await db.dbService
      .withWriteTx(async (tx) => {
        handle = await enqueueTxTest(runtime, tx, 'internal.echo', { message: 'doomed' });
        throw new Error('rollback');
      })
      .catch(() => {});

    if (!handle) throw new Error('handle not assigned');
    // Housekeeping verification runs regardless of claim eligibility.
    await runtime.pump({ reason: 'manual' });
    expect(await jobService.getById(handle.id)).toBeNull();
    expect(await settlesWithin(handle.finished, 60)).toBe(false);

    gate.release();
    await Promise.all(blockers.map((h) => h.finished));
  });

  it('an idempotency hit inside the transaction shares the existing handle', async () => {
    let clock = 1_000_000;
    const { db, runtime } = await setup([['internal.echo', makeEchoHandler()]], {
      now: () => clock,
    });
    const first = await enqueueTest(
      runtime,
      'internal.echo',
      { message: 'a' },
      { idempotencyKey: 'once', scheduledAt: clock + 60_000 },
    );

    const second = await db.dbService.withWriteTx((tx) =>
      enqueueTxTest(runtime, tx, 'internal.echo', { message: 'b' }, { idempotencyKey: 'once' }),
    );
    expect(second.id).toBe(first.id);
    expect(second.finished).toBe(first.finished);

    // No duplicate row was inserted.
    const rows = await db.database.select({ id: jobTable.id }).from(jobTable);
    expect(rows).toHaveLength(1);
  });
});
