import type { FileEntry } from '@cherrystudio/universal/data/types/file';

import {
  FILE_MAINTENANCE_BATCH_LIMIT,
  FILE_MAINTENANCE_GRACE_MS,
  runFileMaintenance,
} from '../fileMaintenance';
import { deleteInternalFile, deleteInternalFileUri, listInternalFiles } from '../fileStorage';

jest.mock('../fileStorage', () => ({
  deleteInternalFile: jest.fn(),
  deleteInternalFileUri: jest.fn(),
  listInternalFiles: jest.fn(() => []),
}));

const entryId = '00000000-0000-7000-8000-000000000001';
const now = 10 * FILE_MAINTENANCE_GRACE_MS;
const internalEntry = {
  cleanupPolicy: 'delete_when_unreferenced',
  contentHash: null,
  createdAt: 1,
  ext: 'txt',
  id: entryId,
  name: 'temporary',
  origin: 'internal',
  size: 1,
  updatedAt: 1,
} as FileEntry;

describe('runFileMaintenance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => jest.restoreAllMocks());

  it('rechecks policy and refs in a write transaction before deleting DB then Blob', async () => {
    const dependencies = createDependencies([internalEntry]);
    const report = await runFileMaintenance(dependencies);

    expect(dependencies.entries.findCleanupCandidates).toHaveBeenCalledWith({
      graceMs: FILE_MAINTENANCE_GRACE_MS,
      limit: FILE_MAINTENANCE_BATCH_LIMIT,
    });
    expect(dependencies.entries.deleteTx).toHaveBeenCalledWith(expect.anything(), entryId);
    expect(deleteInternalFile).toHaveBeenCalledWith(internalEntry);
    expect(dependencies.entries.deleteTx.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(deleteInternalFile).mock.invocationCallOrder[0],
    );
    expect(report).toEqual(
      expect.objectContaining({
        entryCleanup: expect.objectContaining({ candidates: 1, deleted: 1 }),
        outcome: 'completed',
      }),
    );
  });

  it('preserves a candidate when refs reappear during the transaction', async () => {
    const dependencies = createDependencies([internalEntry], 1);
    const report = await runFileMaintenance(dependencies);

    expect(dependencies.entries.deleteTx).not.toHaveBeenCalled();
    expect(deleteInternalFile).not.toHaveBeenCalled();
    expect(report.entryCleanup.refsReappeared).toBe(1);
  });

  it('deletes external rows without touching external files', async () => {
    const externalEntry = {
      cleanupPolicy: 'delete_when_unreferenced',
      createdAt: 1,
      ext: 'txt',
      externalPath: '/tmp/user-file.txt',
      id: entryId,
      name: 'user-file',
      origin: 'external',
      updatedAt: 1,
    } as FileEntry;
    const dependencies = createDependencies([externalEntry]);

    const report = await runFileMaintenance(dependencies);

    expect(report.entryCleanup.deleted).toBe(1);
    expect(deleteInternalFile).not.toHaveBeenCalled();
    expect(deleteInternalFileUri).not.toHaveBeenCalled();
  });

  it('reports unlink failures after committing the row deletion', async () => {
    jest.mocked(deleteInternalFile).mockImplementationOnce(() => {
      throw new Error('unlink failed');
    });
    const dependencies = createDependencies([internalEntry]);

    const report = await runFileMaintenance(dependencies);

    expect(dependencies.entries.deleteTx).toHaveBeenCalled();
    expect(report.entryCleanup.unlinkFailures).toBe(1);
    expect(report.outcome).toBe('partial');
  });

  it('scans only old UUID files absent from the full DB ID snapshot', async () => {
    const liveId = '00000000-0000-7000-8000-000000000002';
    const youngId = '00000000-0000-7000-8000-000000000003';
    const dependencies = createDependencies([]);
    dependencies.entries.listAllIds.mockResolvedValue(new Set([liveId]));
    jest
      .mocked(listInternalFiles)
      .mockReturnValue([
        fileOnDisk(entryId, 1),
        fileOnDisk(liveId, 1),
        fileOnDisk(youngId, now - FILE_MAINTENANCE_GRACE_MS + 1),
      ]);

    const report = await runFileMaintenance(dependencies);

    expect(deleteInternalFileUri).toHaveBeenCalledTimes(1);
    expect(deleteInternalFileUri).toHaveBeenCalledWith(
      `file:///documents/Data/Files/${entryId}.txt`,
    );
    expect(report.orphanFiles).toEqual({ candidates: 1, deleted: 1, failed: 0, scanned: 3 });
  });
});

function createDependencies(candidates: FileEntry[], refCount = 0) {
  const transaction = {};
  const entries = {
    deleteTx: jest.fn(async () => undefined),
    findByIdTx: jest.fn(async (_tx, id) => candidates.find((entry) => entry.id === id) ?? null),
    findCleanupCandidates: jest.fn(async () => candidates),
    listAllIds: jest.fn(async () => new Set(candidates.map((entry) => entry.id))),
    withWriteTx: jest.fn(async (callback) => callback(transaction)),
  };
  const refs = {
    countPersistentRefsByEntryIdTx: jest.fn(async () => refCount),
  };
  return { entries, refs } as unknown as {
    entries: typeof entries;
    refs: typeof refs;
  };
}

function fileOnDisk(id: string, modificationTime: number) {
  return {
    id,
    modificationTime,
    name: `${id}.txt`,
    uri: `file:///documents/Data/Files/${id}.txt`,
  };
}
