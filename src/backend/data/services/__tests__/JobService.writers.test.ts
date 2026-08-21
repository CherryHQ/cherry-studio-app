import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { eq } from 'drizzle-orm';

import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import type { Database } from '@/backend/data/db/DbService';
import { type InsertJobRow, jobTable } from '@/backend/data/db/schemas/job';
import type { JobError } from '@/shared/data/api/schemas/jobs';

import { JobService } from '../JobService';
import { createTestDb, type TestDb } from './_testDb';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

const mockLoggerWarn = jest.fn();
jest.mock('@logger', () => ({
  loggerService: {
    // JobService binds its logger at module load, before this file's `const`
    // initializers run — forward lazily instead of capturing the mock now.
    withContext: () => ({
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: (...args: unknown[]) => mockLoggerWarn(...args),
    }),
  },
}));

const someError: JobError = { code: 'JOB_HANDLER_THREW', message: 'boom', retryable: true };

describe('JobService runtime writers', () => {
  let sqlite: DatabaseSync;
  let db: TestDb;
  let tx: Database;
  let service: JobService;

  beforeEach(async () => {
    mockLoggerWarn.mockClear();
    sqlite = new DatabaseSync(':memory:');
    db = createTestDb(sqlite);
    await installTestHost({ DbService: db.dbService });
    tx = db.database;
    service = new JobService();
  });

  afterEach(async () => {
    await uninstallTestHost();
    sqlite.close();
  });

  async function insertJob(overrides: Partial<InsertJobRow> = {}) {
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

  describe('getEligiblePendingTx + claimPendingByIdTx', () => {
    it('orders by priority ASC, scheduledAt ASC, id ASC', async () => {
      await insertJob({ id: 'b', priority: 0, scheduledAt: 200 });
      await insertJob({ id: 'a', priority: 0, scheduledAt: 200 });
      await insertJob({ id: 'c', priority: -1, scheduledAt: 900 });
      await insertJob({ id: 'd', priority: 0, scheduledAt: 100 });
      const rows = await service.getEligiblePendingTx(tx, 1000, ['t'], 10);
      expect(rows.map((row) => row.id)).toEqual(['c', 'd', 'a', 'b']);
    });

    it('excludes future, cancel-requested, and non-pending rows', async () => {
      await insertJob({ id: 'future', scheduledAt: 2000 });
      await insertJob({ cancelRequested: true, id: 'cancelling' });
      await insertJob({ id: 'active', status: 'running' });
      await insertJob({ id: 'due', scheduledAt: 500 });
      const rows = await service.getEligiblePendingTx(tx, 1000, ['t'], 10);
      expect(rows.map((row) => row.id)).toEqual(['due']);
    });

    it('claims pending exactly once and stamps startedAt', async () => {
      const row = await insertJob({});
      const claimed = await service.claimPendingByIdTx(tx, row.id, 1234);
      expect(claimed?.status).toBe('running');
      expect(claimed?.startedAt).toBe(1234);
      expect(await service.claimPendingByIdTx(tx, row.id, 1234)).toBeNull();
    });

    it('refuses to claim a cancel-requested row', async () => {
      const row = await insertJob({ cancelRequested: true });
      expect(await service.claimPendingByIdTx(tx, row.id, 1234)).toBeNull();
    });
  });

  describe('setTerminalTx (weak fence)', () => {
    it('finalizes a running row and never reopens a terminal one', async () => {
      const row = await insertJob({ status: 'running' });
      const completed = await service.setTerminalTx(tx, row.id, 'completed', { ok: true }, null, [
        'running',
      ]);
      expect(completed).toMatchObject({
        snapshot: { id: row.id, output: { ok: true }, status: 'completed' },
        updated: true,
      });
      const done = await service.getById(row.id);
      expect(done?.status).toBe('completed');
      expect(done?.output).toEqual({ ok: true });
      expect(done?.finishedAt).not.toBeNull();

      // A late callback presenting the same expectation is a no-op.
      expect(
        await service.setTerminalTx(tx, row.id, 'failed', undefined, someError, ['running']),
      ).toMatchObject({ snapshot: { id: row.id, status: 'completed' }, updated: false });
      expect((await service.getById(row.id))?.status).toBe('completed');
    });

    it('is fenced by expectedStatuses', async () => {
      const row = await insertJob({ status: 'pending' });
      expect(
        await service.setTerminalTx(tx, row.id, 'cancelled', undefined, null, ['running']),
      ).toMatchObject({ snapshot: { id: row.id, status: 'pending' }, updated: false });
      expect(
        await service.setTerminalTx(tx, row.id, 'cancelled', undefined, null, [
          'pending',
          'delayed',
        ]),
      ).toMatchObject({ snapshot: { id: row.id, status: 'cancelled' }, updated: true });
    });
  });

  describe('setDelayedRetryTx', () => {
    it('moves only running rows into delayed backoff', async () => {
      const row = await insertJob({ startedAt: 5, status: 'running' });
      expect(await service.setDelayedRetryTx(tx, row.id, 1, 9999, someError)).toBe(1);
      const updated = await service.getRowByIdTx(tx, row.id);
      expect(updated?.status).toBe('delayed');
      expect(updated?.attempt).toBe(1);
      expect(updated?.scheduledAt).toBe(9999);
      expect(updated?.startedAt).toBeNull();

      const pendingRow = await insertJob({});
      expect(await service.setDelayedRetryTx(tx, pendingRow.id, 1, 9999, someError)).toBe(0);
    });
  });

  describe('setMetadataTx', () => {
    it('writes only while the row is running', async () => {
      const running = await insertJob({ status: 'running' });
      expect(await service.setMetadataTx(tx, running.id, { cursor: 7 })).toBe(1);
      expect((await service.getRowByIdTx(tx, running.id))?.metadata).toEqual({ cursor: 7 });

      const done = await insertJob({ status: 'completed' });
      expect(await service.setMetadataTx(tx, done.id, { cursor: 8 })).toBe(0);
    });
  });

  describe('promoteDelayedDueTx', () => {
    it('promotes due rows idempotently and leaves future rows alone', async () => {
      await insertJob({ id: 'due', scheduledAt: 100, status: 'delayed' });
      await insertJob({ id: 'future', scheduledAt: 9000, status: 'delayed' });
      expect(await service.promoteDelayedDueTx(tx, 1000)).toBe(1);
      expect(await service.promoteDelayedDueTx(tx, 1000)).toBe(0);
      expect((await service.getRowByIdTx(tx, 'due'))?.status).toBe('pending');
      expect((await service.getRowByIdTx(tx, 'future'))?.status).toBe('delayed');
    });
  });

  describe('idempotency key', () => {
    it('partial unique index rejects a second active row for the same key', async () => {
      await insertJob({ idempotencyKey: 'k1' });
      // drizzle's proxy driver wraps the SQLITE_CONSTRAINT_UNIQUE error, so
      // assert the rejection plus the invariant it protects.
      await expect(insertJob({ idempotencyKey: 'k1' })).rejects.toThrow();
      const rows = await tx.select().from(jobTable).where(eq(jobTable.idempotencyKey, 'k1'));
      expect(rows).toHaveLength(1);
    });

    it('allows key reuse after the previous job is terminal', async () => {
      const first = await insertJob({ idempotencyKey: 'k1' });
      await service.setTerminalTx(tx, first.id, 'completed', undefined, null, ['pending']);
      await expect(insertJob({ idempotencyKey: 'k1' })).resolves.toBeDefined();
    });

    it('findActiveByIdempotencyKeyTx ignores terminal rows', async () => {
      const first = await insertJob({ idempotencyKey: 'k1' });
      expect((await service.findActiveByIdempotencyKeyTx(tx, 'k1'))?.id).toBe(first.id);
      await service.setTerminalTx(tx, first.id, 'cancelled', undefined, null, ['pending']);
      expect(await service.findActiveByIdempotencyKeyTx(tx, 'k1')).toBeNull();
    });
  });

  describe('GC prunes', () => {
    it('prunes terminal rows older than the cutoff, never active ones', async () => {
      await insertJob({ finishedAt: 10, id: 'old', status: 'completed' });
      await insertJob({ finishedAt: 500, id: 'recent', status: 'failed' });
      await insertJob({ id: 'active', status: 'running' });
      expect(await service.pruneTerminalOlderThanTx(tx, 100)).toBe(1);
      expect(await service.getRowByIdTx(tx, 'old')).toBeNull();
      expect(await service.getRowByIdTx(tx, 'recent')).not.toBeNull();
      expect(await service.getRowByIdTx(tx, 'active')).not.toBeNull();
    });

    it('keeps only the latest N terminal rows per type', async () => {
      for (let i = 0; i < 5; i += 1) {
        await insertJob({ finishedAt: i * 100, id: `job-${i}`, status: 'completed' });
      }
      await insertJob({ finishedAt: 1, id: 'other-type', status: 'failed', type: 'other' });
      expect(await service.pruneTerminalKeepLatestPerTypeTx(tx, 3)).toBe(2);
      expect(await service.getRowByIdTx(tx, 'job-0')).toBeNull();
      expect(await service.getRowByIdTx(tx, 'job-1')).toBeNull();
      expect(await service.getRowByIdTx(tx, 'job-4')).not.toBeNull();
      expect(await service.getRowByIdTx(tx, 'other-type')).not.toBeNull();
    });
  });

  describe('rowToSnapshot error validation', () => {
    it('round-trips a well-formed error column untouched', async () => {
      const row = await insertJob({ error: someError });
      expect((await service.getById(row.id))?.error).toEqual(someError);
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });

    it('substitutes a sentinel for a structurally invalid error column AND warns', async () => {
      // Schema drift / manual SQL edit: valid JSON, wrong shape. Silently
      // swapping in the sentinel would erase the only trace of corruption.
      const row = await insertJob({ error: { nonsense: true } as never });
      const snapshot = await service.getById(row.id);
      expect(snapshot?.error).toEqual({
        code: 'JOB_CORRUPT_ERROR_ROW',
        message: 'Persisted error column did not match JobErrorSchema',
        retryable: false,
      });
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('failed schema validation'),
        expect.objectContaining({ rowId: row.id }),
      );
    });
  });

  describe('recovery reads', () => {
    it('getActiveByType returns newest first with id tiebreak', async () => {
      await insertJob({ createdAt: 100, id: 'a', status: 'running' });
      await insertJob({ createdAt: 300, id: 'b', status: 'pending' });
      await insertJob({ createdAt: 300, id: 'c', status: 'delayed' });
      await insertJob({ createdAt: 200, id: 'terminal', status: 'completed' });
      const rows = await service.getActiveByType('t');
      expect(rows.map((row) => row.id)).toEqual(['c', 'b', 'a']);
    });

    it('earliestDelayedAt returns the minimum delayed due time', async () => {
      expect(await service.earliestDelayedAt()).toBeNull();
      await insertJob({ scheduledAt: 700, status: 'delayed' });
      await insertJob({ scheduledAt: 300, status: 'delayed' });
      expect(await service.earliestDelayedAt()).toBe(300);
    });

    it('counts running rows globally and per queue', async () => {
      await insertJob({ queue: 'q1', status: 'running' });
      await insertJob({ queue: 'q1', status: 'running' });
      await insertJob({ queue: 'q2', status: 'running' });
      await insertJob({ queue: 'q1', status: 'pending' });
      expect(await service.countRunningGlobalTx(tx)).toBe(3);
      const perQueue = await service.countRunningPerQueueTx(tx);
      expect(perQueue.get('q1')).toBe(2);
      expect(perQueue.get('q2')).toBe(1);
    });
  });
});
