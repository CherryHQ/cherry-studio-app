import type { TraceSpanRecord } from '@/shared/data/types/trace';

import { TraceStorageService } from '../TraceStorageService';
import type { TraceFileStorage, TraceStorageDiagnostics } from '../types';

jest.mock('../traceFileStorage', () => ({ traceFileStorage: {} }));
jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: () => (++sequence).toString(16).padStart(8, '0').padEnd(32, '0') };
});
jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: { withContext: () => ({ warn: jest.fn(), error: jest.fn() }) },
}));

function fixture() {
  const records: TraceSpanRecord[] = [];
  const snapshot = { directoryUri: 'cache://snapshot', files: [], dispose: jest.fn() };
  const storage = {
    writeBatch: jest.fn(async (lines: readonly string[]) => {
      records.push(...lines.map((line) => JSON.parse(line)));
    }),
    prune: jest.fn(async () => {}),
    snapshot: jest.fn(async (_now: number, _diagnostics: TraceStorageDiagnostics) => snapshot),
  } satisfies TraceFileStorage;
  return { service: new TraceStorageService(storage), storage, records, snapshot };
}

describe('TraceStorageService', () => {
  it('isolates write failures and drains later records before making a diagnostic snapshot', async () => {
    const { service, storage, records, snapshot } = fixture();
    storage.writeBatch.mockRejectedValueOnce(new Error('disk full'));
    service.startTrace('failed-write')?.end('ok');
    await expect(service.flush()).resolves.toBeUndefined();
    service.startTrace('next')?.end('ok');

    await expect(service.createDiagnosticSnapshot()).resolves.toBe(snapshot);
    expect(records.map((record) => record.name)).toEqual(['next', 'next']);
    expect(storage.snapshot).toHaveBeenCalledWith(expect.any(Number), {
      droppedRecords: 2,
      writeFailures: 1,
    });
  });

  it('serializes export with capture so copying cannot race a retention write', async () => {
    const { service, storage, snapshot } = fixture();
    let finishCopy!: () => void;
    let copying!: () => void;
    const startedCopy = new Promise<void>((resolve) => {
      copying = resolve;
    });
    storage.snapshot.mockImplementationOnce(async () => {
      copying();
      await new Promise<void>((resolve) => {
        finishCopy = resolve;
      });
      return snapshot;
    });
    service.startTrace('before')?.end('ok');
    const exporting = service.createDiagnosticSnapshot();
    await startedCopy;
    const writesBefore = storage.writeBatch.mock.calls.length;
    service.startTrace('during')?.end('ok');
    await Promise.resolve();
    expect(storage.writeBatch).toHaveBeenCalledTimes(writesBefore);
    finishCopy();
    await exporting;
    await service.flush();
    expect(storage.writeBatch.mock.calls.length).toBeGreaterThan(writesBefore);
  });

  it('does not report committed records as dropped when retention fails', async () => {
    const { service, storage, records } = fixture();
    storage.prune.mockRejectedValueOnce(new Error('cleanup failed'));
    service.startTrace('retained')?.end('ok');
    await service.createDiagnosticSnapshot();
    expect(records).toHaveLength(2);
    expect(storage.snapshot).toHaveBeenCalledWith(expect.any(Number), {
      droppedRecords: 0,
      writeFailures: 1,
    });
  });

  it('closes outstanding work at shutdown and fences all subsequent producer writes', async () => {
    const { service, records } = fixture();
    const root = service.startTrace('turn');
    const child = root?.startSpan('provider');
    await service._doStop();
    child?.end('ok');
    expect(service.startTrace('too-late')).toBeUndefined();
    await service.flush();
    expect(records).toHaveLength(4);
    expect(
      records.filter((record) => record.revision === 2).map((record) => record.status),
    ).toEqual(['interrupted', 'interrupted']);
  });

  it('bounds active work while the disk is blocked', async () => {
    const { service, storage } = fixture();
    let finishWrite!: () => void;
    const blocked = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    storage.writeBatch.mockImplementationOnce(() => blocked);
    for (let index = 0; index < 32; index += 1) service.startTrace('turn');
    expect(service.startTrace('over-limit')).toBeUndefined();
    finishWrite();
    await service._doStop();
    await service.createDiagnosticSnapshot();
    expect(storage.snapshot).toHaveBeenCalledWith(expect.any(Number), {
      droppedRecords: 1,
      writeFailures: 0,
    });
  });
});
