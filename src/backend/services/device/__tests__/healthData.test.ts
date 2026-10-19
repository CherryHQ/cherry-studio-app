import { devicePermissions } from '@/backend/services/permissions';

import {
  getHealthRecord,
  queryHealthData,
  shareVerifiableHealthRecords,
  type HealthDataReaderLoader,
} from '../healthData';

const input = {
  type: 'sleep',
  startDate: '2026-09-01T00:00:00Z',
  endDate: '2026-09-02T00:00:00Z',
  limit: 50,
  cursor: '',
  mode: 'samples' as const,
  granularity: 'summary' as const,
  workoutId: '',
  reselectRecords: false,
};

describe('health query semantics', () => {
  test.each([
    { type: 'sleep', mode: 'statistics' as const },
    { type: 'steps', mode: 'statistics' as const, cursor: 'old-page' },
    { type: 'dateOfBirth', workoutId: 'workout-1' },
    { type: 'sleep', reselectRecords: true },
  ])('rejects unsupported query combinations before reading native data: %j', async (changes) => {
    const load = jest.fn() as jest.MockedFunction<HealthDataReaderLoader>;
    await expect(queryHealthData({ ...input, ...changes }, load)).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  });

  test('preserves the whole-calendar-day meaning of activity rings', async () => {
    const note = 'Activity rings cover whole local calendar days; partial days are not prorated.';
    const load = (async () => ({
      query: async () => ({ data: [], intervalNote: note }),
    })) as unknown as HealthDataReaderLoader;
    const result = await queryHealthData({ ...input, type: 'activitySummary' }, load);
    expect(result.intervalNote).toBe(note);
  });
});

const selectionReads = [
  {
    name: 'CDA document',
    read: (load: HealthDataReaderLoader, signal?: AbortSignal) =>
      getHealthRecord(
        { type: 'cdaDocument', id: 'document-1', attachmentId: '', offset: 0, limit: 1000 },
        load,
        signal,
      ),
  },
  {
    name: 'verifiable credential',
    read: (load: HealthDataReaderLoader, signal?: AbortSignal) =>
      shareVerifiableHealthRecords(
        {
          recordTypes: ['immunization'],
          sourceTypes: ['smartHealthCard'],
          offset: 0,
          limit: 20,
          dataOffset: 0,
          dataLimit: 1000,
        },
        load,
        signal,
      ),
  },
];

describe.each(selectionReads)('$name system selection', ({ read }) => {
  test('waits for the permission queue and holds it until native completion', async () => {
    const finishPermission = createDeferred();
    const started = createDeferred();
    const finishRead = createDeferred();
    const permission = devicePermissions.runWithSystemPrompt(() => finishPermission.promise);
    const nativeRead = jest.fn(async () => {
      started.resolve();
      await finishRead.promise;
      return { data: [] };
    });
    const load = (async () => ({
      getRecord: nativeRead,
      shareVerifiableRecords: nativeRead,
    })) as unknown as HealthDataReaderLoader;
    const result = read(load);
    await Promise.resolve();
    expect(nativeRead).not.toHaveBeenCalled();

    finishPermission.resolve();
    await permission;
    await started.promise;
    const getStatuses = jest.spyOn(devicePermissions, 'getStatuses');
    const nextPermission = devicePermissions.request([]);
    await Promise.resolve();
    expect(getStatuses).not.toHaveBeenCalled();

    finishRead.resolve();
    await result;
    await nextPermission;
    expect(getStatuses).toHaveBeenCalled();
    getStatuses.mockRestore();
  });

  test('skips a cancelled queued selection and admits the next request', async () => {
    const finishPermission = createDeferred();
    const permission = devicePermissions.runWithSystemPrompt(() => finishPermission.promise);
    const nativeRead = jest.fn(async () => ({ data: [] }));
    const load = (async () => ({
      getRecord: nativeRead,
      shareVerifiableRecords: nativeRead,
    })) as unknown as HealthDataReaderLoader;
    const controller = new AbortController();
    const result = read(load, controller.signal);
    const rejected = expect(result).rejects.toThrow();
    await Promise.resolve();
    controller.abort();
    const nextPermission = devicePermissions.request([]);

    finishPermission.resolve();
    await permission;
    await rejected;
    await nextPermission;
    expect(nativeRead).not.toHaveBeenCalled();
  });
});

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
