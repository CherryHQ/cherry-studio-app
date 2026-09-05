import type { JobError } from '@/shared/data/api/schemas/jobs';

import type { JobHandler, RecoveryStrategy } from '../../types';
import { type RecoveryJobRow, type RecoveryRepo, runStartupRecovery } from '../recovery';

type SeedRow = RecoveryJobRow;

function makeHandler(recovery: RecoveryStrategy): JobHandler {
  return {
    executionClass: 'foreground-only',
    recovery,
    execute: async () => 'noop',
  };
}

function makeRepo(rows: SeedRow[]) {
  const cancelled: { error: JobError; ids: string[] }[] = [];
  const reset: string[][] = [];
  const repo: RecoveryRepo = {
    cancelByIds: async (ids, error) => {
      cancelled.push({ error, ids: [...ids] });
    },
    // Contract: newest first. Callers seed rows in newest-first order.
    getActiveByType: async (type) => rows.filter((row) => row.type === type),
    getStaleActive: async () => rows,
    resetToPendingByIds: async (ids) => {
      reset.push([...ids]);
    },
  };
  return { cancelled, repo, reset };
}

const row = (
  id: string,
  type: string,
  status: SeedRow['status'],
  cancelRequested = false,
): SeedRow => ({ cancelRequested, id, status, type });

describe('runStartupRecovery', () => {
  it('abandon cancels every non-terminal row', async () => {
    const { cancelled, repo, reset } = makeRepo([
      row('a', 't', 'running'),
      row('b', 't', 'pending'),
      row('c', 't', 'delayed'),
    ]);
    const stats = await runStartupRecovery(
      repo,
      new Map([['t', makeHandler('abandon')]]),
      () => false,
    );
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].ids).toEqual(['a', 'b', 'c']);
    expect(cancelled[0].error.code).toBe('JOB_CANCELLED');
    expect(reset).toHaveLength(0);
    expect(stats).toEqual({ cancelled: 3, delayedKept: 0, pendingReset: 0, singletonKept: 0 });
  });

  it('retry resets running to pending, keeps delayed, leaves pending alone', async () => {
    const { cancelled, repo, reset } = makeRepo([
      row('a', 't', 'running'),
      row('b', 't', 'delayed'),
      row('c', 't', 'pending'),
    ]);
    const stats = await runStartupRecovery(
      repo,
      new Map([['t', makeHandler('retry')]]),
      () => false,
    );
    expect(reset).toEqual([['a']]);
    expect(cancelled).toHaveLength(0);
    expect(stats).toEqual({ cancelled: 0, delayedKept: 1, pendingReset: 1, singletonKept: 0 });
  });

  it('singleton keeps the newest row (resetting it when running) and cancels the rest', async () => {
    const { cancelled, repo, reset } = makeRepo([
      row('newest', 't', 'running'),
      row('older', 't', 'pending'),
      row('oldest', 't', 'running'),
    ]);
    const stats = await runStartupRecovery(
      repo,
      new Map([['t', makeHandler('singleton')]]),
      () => false,
    );
    expect(reset).toEqual([['newest']]);
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].ids).toEqual(['older', 'oldest']);
    expect(stats).toEqual({ cancelled: 2, delayedKept: 0, pendingReset: 1, singletonKept: 1 });
  });

  it('singleton keeps a non-running newest row without resetting it', async () => {
    const { cancelled, repo, reset } = makeRepo([
      row('newest', 't', 'delayed'),
      row('older', 't', 'pending'),
    ]);
    const stats = await runStartupRecovery(
      repo,
      new Map([['t', makeHandler('singleton')]]),
      () => false,
    );
    expect(reset).toHaveLength(0);
    expect(cancelled[0].ids).toEqual(['older']);
    expect(stats.singletonKept).toBe(1);
  });

  it('cancelRequested overrides every strategy', async () => {
    const { cancelled, repo, reset } = makeRepo([
      row('a', 'retryType', 'running', true),
      row('b', 'retryType', 'running'),
      row('c', 'singletonType', 'pending', true),
    ]);
    const stats = await runStartupRecovery(
      repo,
      new Map([
        ['retryType', makeHandler('retry')],
        ['singletonType', makeHandler('singleton')],
      ]),
      () => false,
    );
    // 'a' cancelled by override despite retry; 'b' reset; 'c' cancelled by
    // override, leaving singletonType with nothing to keep.
    expect(cancelled.flatMap((c) => c.ids).sort()).toEqual(['a', 'c']);
    expect(reset).toEqual([['b']]);
    expect(stats.cancelled).toBe(2);
    expect(stats.singletonKept).toBe(0);
  });

  it('excludes in-flight rows before the override and every strategy', async () => {
    const { cancelled, repo, reset } = makeRepo([
      row('inflight', 't', 'running', true),
      row('stale', 't', 'running'),
    ]);
    const stats = await runStartupRecovery(
      repo,
      new Map([['t', makeHandler('abandon')]]),
      (jobId) => jobId === 'inflight',
    );
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].ids).toEqual(['stale']);
    expect(reset).toHaveLength(0);
    expect(stats.cancelled).toBe(1);
  });

  it('cancels orphan rows whose type has no registered handler', async () => {
    const { cancelled, repo } = makeRepo([
      row('a', 'ghost.type', 'running'),
      row('b', 'ghost.type', 'pending'),
      row('c', 'ghost.type', 'delayed'),
    ]);
    const stats = await runStartupRecovery(repo, new Map(), () => false);
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].ids).toEqual(['a', 'b', 'c']);
    expect(cancelled[0].error.message).toContain('Orphan job');
    expect(stats.cancelled).toBe(3);
  });

  it('returns zero stats when there is nothing to recover', async () => {
    const { cancelled, repo, reset } = makeRepo([]);
    const stats = await runStartupRecovery(
      repo,
      new Map([['t', makeHandler('retry')]]),
      () => false,
    );
    expect(cancelled).toHaveLength(0);
    expect(reset).toHaveLength(0);
    expect(stats).toEqual({ cancelled: 0, delayedKept: 0, pendingReset: 0, singletonKept: 0 });
  });
});
