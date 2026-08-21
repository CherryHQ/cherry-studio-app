import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { uninstallTestHost } from '@/backend/core/application/testHost';
import { JOB_ERROR_CODES } from '@/shared/data/api/schemas/jobs';

import { DISPOSE_DRAIN_TIMEOUT_MS } from '../JobRuntime';
import { MAX_CANCEL_REASON_CHARS } from '../types';
import {
  createTestRuntime,
  enqueueTest,
  makeEchoHandler,
  makeGate,
  makeHoldHandler,
  makeStubbornHandler,
  settlesWithin,
  type TestRuntime,
  waitFor,
} from './_helpers';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

describe('JobRuntime cancel & dispose', () => {
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
    // Await: dispose now drains in-flight handlers, and closing SQLite out from
    // under that drain is exactly the teardown race the drain exists to prevent.
    await ctx?.runtime._doStop();
    await uninstallTestHost();
    sqlite?.close();
    ctx = undefined;
    sqlite = undefined;
  });

  it('rejects a cancel reason above the length cap', async () => {
    const { runtime } = await setup([['internal.echo', makeEchoHandler()]]);
    await expect(
      runtime.cancel('whatever', 'x'.repeat(MAX_CANCEL_REASON_CHARS + 1)),
    ).rejects.toMatchObject({ code: JOB_ERROR_CODES.CANCEL_REASON_TOO_LONG });
  });

  it('cancels a delayed job immediately without running it', async () => {
    let clock = 1_000_000;
    const { jobService, runtime } = await setup([['internal.echo', makeEchoHandler()]], {
      now: () => clock,
    });
    const handle = await enqueueTest(
      runtime,
      'internal.echo',
      { message: 'never' },
      { scheduledAt: clock + 60_000 },
    );

    const result = await runtime.cancel(handle.id, 'changed my mind');
    expect(result.outcome).toBe('cancelled');

    const finished = await handle.finished;
    expect(finished.status).toBe('cancelled');
    expect(finished.error?.code).toBe(JOB_ERROR_CODES.CANCELLED);
    expect(finished.error?.message).toBe('changed my mind');

    // A cancelled row never revives, even once its scheduledAt is due.
    clock += 120_000;
    await runtime.pump({ reason: 'manual' });
    expect((await jobService.getById(handle.id))?.status).toBe('cancelled');
  });

  it('cancels a cap-blocked pending job without running it', async () => {
    const gate = makeGate();
    const { jobService, runtime } = await setup([
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

    const blocked = await enqueueTest(runtime, 'internal.echo', { message: 'blocked' });
    expect((await jobService.getById(blocked.id))?.status).toBe('pending');

    expect((await runtime.cancel(blocked.id)).outcome).toBe('cancelled');
    expect((await blocked.finished).status).toBe('cancelled');

    gate.release();
    await Promise.all(blockers.map((h) => h.finished));
    // The freed slots must not resurrect the cancelled job.
    expect((await jobService.getById(blocked.id))?.status).toBe('cancelled');
  });

  it('cancels a signal-respecting running job within the grace window, never retrying it', async () => {
    const gate = makeGate();
    const { jobService, runtime } = await setup([['internal.hold', makeHoldHandler(gate)]]);
    const handle = await enqueueTest(runtime, 'internal.hold', {}, { maxAttempts: 3 });
    await waitFor(async () => (await jobService.getById(handle.id))?.status === 'running');

    const result = await runtime.cancel(handle.id, 'user asked');
    expect(result.outcome).toBe('cancelled');

    const finished = await handle.finished;
    expect(finished.status).toBe('cancelled');
    expect(finished.error?.code).toBe(JOB_ERROR_CODES.CANCELLED);
    expect(finished.error?.message).toContain('user asked');
    // User cancel bypasses the retry gate despite remaining attempts.
    expect(finished.attempt).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect((await jobService.getById(handle.id))?.status).toBe('cancelled');
  });

  it('force-finalizes a stubborn handler as timed-out; the late settle is a fenced no-op', async () => {
    const gate = makeGate();
    let settledCount = 0;
    const releaseLease = jest.fn();
    const { jobService, runtime } = await setup(
      [
        [
          'internal.stubborn',
          makeStubbornHandler(gate, {
            executionClass: 'user-continued',
            onSettled: () => {
              settledCount += 1;
            },
          }),
        ],
      ],
      { keepAlive: { acquire: () => ({ release: releaseLease }) } },
    );
    const handle = await enqueueTest(runtime, 'internal.stubborn', {});
    await waitFor(async () => (await jobService.getById(handle.id))?.status === 'running');

    const result = await runtime.cancel(handle.id, 'give up');
    expect(result.outcome).toBe('timed-out');

    const finished = await handle.finished;
    expect(finished.status).toBe('cancelled');
    expect(finished.error?.code).toBe(JOB_ERROR_CODES.CANCELLED);
    expect(finished.output).toBeNull();
    expect(settledCount).toBe(1);
    expect(releaseLease).toHaveBeenCalledTimes(1);

    // The handler is still running in memory; when it finally returns, the
    // weak fence blocks its completed write — nothing is overwritten.
    gate.release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const after = await jobService.getById(handle.id);
    expect(after?.status).toBe('cancelled');
    expect(after?.output).toBeNull();
    expect(settledCount).toBe(1);
  });

  it('reports not-cancellable for terminal and unknown jobs', async () => {
    const { runtime } = await setup([['internal.echo', makeEchoHandler()]]);
    const handle = await enqueueTest(runtime, 'internal.echo', { message: 'quick' });
    await handle.finished;
    expect((await runtime.cancel(handle.id)).outcome).toBe('not-cancellable');
    expect((await runtime.cancel('no-such-job')).outcome).toBe('not-cancellable');
  });

  it('dispose aborts running jobs, drops finished resolvers, and blocks new enqueues', async () => {
    const gate = makeGate();
    const { jobService, runtime } = await setup([['internal.hold', makeHoldHandler(gate)]]);
    const handle = await enqueueTest(runtime, 'internal.hold', {});
    await waitFor(async () => (await jobService.getById(handle.id))?.status === 'running');

    runtime._doStop();
    runtime._doStop(); // idempotent

    // The abort classifies as cancel and still lands the terminal row…
    await waitFor(async () => (await jobService.getById(handle.id))?.status === 'cancelled');
    // …but the pre-dispose handle's finished promise never settles (dropped,
    // not rejected — the process-death contract).
    expect(await settlesWithin(handle.finished, 60)).toBe(false);

    await expect(enqueueTest(runtime, 'internal.hold', {})).rejects.toThrow('JobRuntime disposed');
    expect((await runtime.cancel(handle.id)).outcome).toBe('not-cancellable');
    expect((await runtime.pump({ reason: 'manual' })).claimed).toBe(0);
  });

  it('drains in-flight handlers so their terminal rows land before dispose resolves', async () => {
    const gate = makeGate();
    const { jobService, runtime } = await setup([['internal.hold', makeHoldHandler(gate)]]);
    const handle = await enqueueTest(runtime, 'internal.hold', {});
    await waitFor(async () => (await jobService.getById(handle.id))?.status === 'running');

    await runtime._doStop();

    // Deliberately not `waitFor`: the row must ALREADY be terminal the moment
    // dispose resolves. Polling here would pass even without a drain, and the
    // real teardown chain closes SQLite immediately after this returns.
    expect((await jobService.getById(handle.id))?.status).toBe('cancelled');
  });

  it('bounds the drain so a handler ignoring its signal cannot hang teardown', async () => {
    const gate = makeGate();
    const { jobService, runtime } = await setup([['internal.stubborn', makeStubbornHandler(gate)]]);
    const handle = await enqueueTest(runtime, 'internal.stubborn', {});
    await waitFor(async () => (await jobService.getById(handle.id))?.status === 'running');

    // Fake timers only from here: `waitFor` above needs the real clock.
    jest.useFakeTimers();
    try {
      const disposed = runtime._doStop();
      await jest.advanceTimersByTimeAsync(DISPOSE_DRAIN_TIMEOUT_MS + 10);
      await expect(disposed).resolves.toBeUndefined();
    } finally {
      jest.useRealTimers();
    }

    // The stubborn handler never settled, so its row stays `running` — that is
    // the documented hand-off to the next cold start's recovery strategy.
    expect((await jobService.getById(handle.id))?.status).toBe('running');
  });

  it('dispose clears the delayed-promotion timer', async () => {
    jest.useFakeTimers();
    try {
      let clock = 1_000_000;
      const { runtime } = await setup([['internal.echo', makeEchoHandler()]], { now: () => clock });
      await enqueueTest(
        runtime,
        'internal.echo',
        { message: 'later' },
        { scheduledAt: clock + 60_000 },
      );
      // pumpOnce re-arms the timer as its final step, so awaiting the pump
      // guarantees the timer exists.
      await runtime.pump({ reason: 'manual' });
      expect(jest.getTimerCount()).toBeGreaterThan(0);
      runtime._doStop();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
