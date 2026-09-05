import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { uninstallTestHost } from '@/backend/core/application/testHost';
import { ScopeDrainTimeoutError } from '@/backend/core/resources/types';
import { JOB_ERROR_CODES } from '@/shared/data/api/schemas/jobs';

import {
  createTestRuntime,
  enqueueTest,
  makeEchoHandler,
  makeGate,
  makeHoldHandler,
  makeStubbornHandler,
  type TestRuntime,
  waitFor,
} from './_helpers';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

const PAINTING = { id: 'p1', kind: 'painting' } as const;

describe('JobRuntime resource scopes', () => {
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

  it('cancels an in-flight job and lands its terminal row before the mutation runs', async () => {
    const gate = makeGate();
    const { jobService, runtime, scopes } = await setup([
      ['painting.generate', makeHoldHandler(gate, { scopes: () => [PAINTING] })],
    ]);
    const handle = await enqueueTest(runtime, 'painting.generate', { paintingId: 'p1' });
    await waitFor(async () => (await jobService.getById(handle.id))?.status === 'running');

    let statusWhenMutating: string | undefined;
    await scopes.delete([PAINTING], async () => {
      // Deliberately read inside the mutation: this is the guarantee — by the
      // time the delete transaction would open, the job has already written its
      // terminal row, so it cannot resurrect the receipt being deleted.
      statusWhenMutating = (await jobService.getById(handle.id))?.status;
    });

    expect(statusWhenMutating).toBe('cancelled');
    expect((await handle.finished).status).toBe('cancelled');
  });

  it('refuses to start a job whose scope is already sealed', async () => {
    const executed = jest.fn();
    const { jobService, runtime, scopes } = await setup([
      [
        'painting.generate',
        makeEchoHandler({
          execute: async () => {
            executed();
            return { echoed: 'ran' };
          },
          scopes: () => [PAINTING],
        }),
      ],
    ]);

    // The painting is gone; nothing may write through it again.
    await scopes.delete([PAINTING], async () => undefined);

    const handle = await enqueueTest(runtime, 'painting.generate', { paintingId: 'p1' });
    const snapshot = await handle.finished;

    expect(snapshot.status).toBe('cancelled');
    expect(executed).not.toHaveBeenCalled();
    expect((await jobService.getById(handle.id))?.status).toBe('cancelled');
  });

  it('registers the scope before claim so deletion can cancel the dispatch window', async () => {
    let clock = 1_000;
    const claimEntered = makeGate();
    const claimGate = makeGate();
    const execute = jest.fn(async () => 'should-not-run');
    const { jobService, runtime, scopes } = await setup(
      [['painting.generate', makeEchoHandler({ execute, scopes: () => [PAINTING] })]],
      { now: () => clock },
    );
    const handle = await enqueueTest(
      runtime,
      'painting.generate',
      { paintingId: 'p1' },
      { scheduledAt: clock + 1_000 },
    );
    const claim = jobService.claimPendingByIdTx.bind(jobService);
    jest.spyOn(jobService, 'claimPendingByIdTx').mockImplementation(async (...args) => {
      claimEntered.release();
      await claimGate.promise;
      return claim(...args);
    });

    clock += 1_000;
    const pumping = runtime.pump({ reason: 'manual' });
    await claimEntered.promise;
    let statusWhenMutating: string | undefined;
    const deletion = scopes.delete([PAINTING], async () => {
      statusWhenMutating = (await jobService.getById(handle.id))?.status;
    });
    await Promise.resolve();

    expect(execute).not.toHaveBeenCalled();
    claimGate.release();
    await Promise.all([pumping, deletion]);

    expect(statusWhenMutating).toBe('cancelled');
    expect(execute).not.toHaveBeenCalled();
  });

  it('releases a prepared scope when the claim transaction fails to commit', async () => {
    let clock = 1_000;
    const execute = jest.fn(async () => 'claimed-after-rollback');
    const { db, jobService, runtime, scopes } = await setup(
      [['painting.generate', makeEchoHandler({ execute, scopes: () => [PAINTING] })]],
      { now: () => clock },
    );
    const handle = await enqueueTest(
      runtime,
      'painting.generate',
      { paintingId: 'p1' },
      { scheduledAt: clock + 1_000 },
    );
    clock += 1_000;
    // Let delayed promotion commit, then fail after the claim callback has
    // registered its scope and changed the row inside the transaction.
    db.failWriteTxCommit(new Error('commit failed'), 1);

    expect((await runtime.pump({ reason: 'manual' })).claimed).toBe(0);
    expect((await jobService.getById(handle.id))?.status).toBe('pending');
    const mutate = jest.fn(async () => undefined);
    await expect(
      scopes.invalidate([PAINTING], mutate, { drainTimeoutMs: 50 }),
    ).resolves.toBeUndefined();
    expect(mutate).toHaveBeenCalledTimes(1);

    expect((await runtime.pump({ reason: 'manual' })).claimed).toBe(1);
    await expect(handle.finished).resolves.toMatchObject({
      output: 'claimed-after-rollback',
      status: 'completed',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('leaves a job whose handler declares no scopes uncoordinated', async () => {
    const gate = makeGate();
    const { jobService, runtime, scopes } = await setup([['internal.hold', makeHoldHandler(gate)]]);
    const handle = await enqueueTest(runtime, 'internal.hold', {});
    await waitFor(async () => (await jobService.getById(handle.id))?.status === 'running');

    // Nothing is registered under the painting, so the pass has nothing to drain
    // and the unrelated job keeps running through it.
    await scopes.delete([PAINTING], async () => undefined);
    expect((await jobService.getById(handle.id))?.status).toBe('running');

    gate.release();
    expect((await handle.finished).status).toBe('completed');
  });

  it('fails the deletion rather than proceeding over a handler that ignores its signal', async () => {
    const gate = makeGate();
    const { jobService, runtime, scopes } = await setup([
      ['painting.generate', makeStubbornHandler(gate, { scopes: () => [PAINTING] })],
    ]);
    const handle = await enqueueTest(runtime, 'painting.generate', { paintingId: 'p1' });
    await waitFor(async () => (await jobService.getById(handle.id))?.status === 'running');

    const mutate = jest.fn(async () => undefined);
    await expect(scopes.delete([PAINTING], mutate, { drainTimeoutMs: 60 })).rejects.toThrow(
      ScopeDrainTimeoutError,
    );

    // The handler is still running in memory, so the row is not deleted out from
    // under it — the caller gets a diagnosable failure instead.
    expect(mutate).not.toHaveBeenCalled();

    gate.release();
    expect((await handle.finished).status).toBe('cancelled');
  });

  it('force-fails a stubborn timeout while releasing its lease but retaining its scope', async () => {
    const gate = makeGate();
    const releaseLease = jest.fn();
    const acquire = jest.fn(() => ({ release: releaseLease }));
    const { runtime, scopes } = await setup(
      [
        [
          'painting.stubborn',
          makeStubbornHandler(gate, {
            cancelTimeoutMs: 20,
            executionClass: 'user-continued',
            scopes: () => [PAINTING],
          }),
        ],
        ['internal.echo', makeEchoHandler()],
      ],
      { keepAlive: { acquire } },
    );
    const timedOut = await enqueueTest(
      runtime,
      'painting.stubborn',
      { paintingId: 'p1' },
      { maxAttempts: 3, queue: 'shared', timeoutMs: 20 },
    );

    await expect(timedOut.finished).resolves.toMatchObject({
      error: { code: JOB_ERROR_CODES.HANDLER_TIMEOUT, retryable: true },
      status: 'failed',
    });
    expect(acquire).toHaveBeenCalledTimes(1);
    await waitFor(() => releaseLease.mock.calls.length === 1);
    expect(releaseLease).toHaveBeenCalledTimes(1);

    // The terminal row frees the queue slot, but the still-running handler
    // remains registered with its resource scope until its real promise exits.
    const next = await enqueueTest(
      runtime,
      'internal.echo',
      { message: 'next' },
      { queue: 'shared' },
    );
    await expect(next.finished).resolves.toMatchObject({ status: 'completed' });
    await expect(
      scopes.invalidate([PAINTING], async () => undefined, { drainTimeoutMs: 30 }),
    ).rejects.toThrow(ScopeDrainTimeoutError);

    gate.release();
    await expect(
      scopes.invalidate([PAINTING], async () => undefined, { drainTimeoutMs: 200 }),
    ).resolves.toBeUndefined();
    expect(acquire).toHaveBeenCalledTimes(1);
  });
});
