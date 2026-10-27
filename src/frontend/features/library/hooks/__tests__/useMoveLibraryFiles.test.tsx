import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiErrorFactory } from '@/shared/data/api/errors';
import { MAX_FILE_MOVE_BATCH_SIZE, type FileMoveResult } from '@/shared/data/types/fileLibrary';

import { useMoveLibraryFiles } from '../useMoveLibraryFiles';

const mockTrigger = jest.fn<
  Promise<FileMoveResult[]>,
  [{ body: { fileEntryIds: string[]; folderId: string | null } }]
>();
jest.mock('@/frontend/data', () => ({
  useMutation: () => ({ trigger: mockTrigger }),
}));

let current: ReturnType<typeof useMoveLibraryFiles>;
let renderer: ReactTestRenderer;

function Probe() {
  const result = useMoveLibraryFiles();
  useEffect(() => {
    current = result;
  }, [result]);
  return null;
}

beforeEach(async () => {
  mockTrigger.mockReset();
  await act(async () => {
    renderer = create(<Probe />);
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
});

it('freezes and deduplicates the selection, bounds requests, and rejects overlapping submissions', async () => {
  const ids = Array.from({ length: MAX_FILE_MOVE_BATCH_SIZE + 1 }, (_, index) => `entry-${index}`);
  const first = deferred<FileMoveResult[]>();
  const last = deferred<FileMoveResult[]>();
  mockTrigger.mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
  let operation!: ReturnType<typeof current.move>;
  act(() => {
    operation = current.move([...ids, ids[0]], 'archive');
  });
  expect(current.progress).toEqual({ completed: 0, total: ids.length });
  expect(mockTrigger).toHaveBeenCalledTimes(1);
  expect(mockTrigger).toHaveBeenLastCalledWith({
    body: { fileEntryIds: ids.slice(0, MAX_FILE_MOVE_BATCH_SIZE), folderId: 'archive' },
  });
  await act(async () => {
    expect(await current.move(['other'], null)).toBeUndefined();
  });
  expect(mockTrigger).toHaveBeenCalledTimes(1);
  await act(async () => {
    first.resolve(ids.slice(0, MAX_FILE_MOVE_BATCH_SIZE).map(moved));
    await first.promise;
  });
  expect(current.progress).toEqual({ completed: MAX_FILE_MOVE_BATCH_SIZE, total: ids.length });
  expect(mockTrigger).toHaveBeenCalledTimes(2);
  expect(mockTrigger).toHaveBeenLastCalledWith({
    body: { fileEntryIds: ids.slice(MAX_FILE_MOVE_BATCH_SIZE), folderId: 'archive' },
  });
  await act(async () => {
    last.resolve(ids.slice(MAX_FILE_MOVE_BATCH_SIZE).map(moved));
    expect(await operation).toEqual(ids.map(moved));
  });
  expect(current.progress).toBeNull();
});

it('retains completed outcomes and returns all unsent entries for retry when a later request fails', async () => {
  const ids = Array.from(
    { length: MAX_FILE_MOVE_BATCH_SIZE * 2 + 1 },
    (_, index) => `entry-${index}`,
  );
  const completed = ids.slice(0, MAX_FILE_MOVE_BATCH_SIZE).map(moved);
  mockTrigger
    .mockResolvedValueOnce(completed)
    .mockRejectedValueOnce(DataApiErrorFactory.notFound('FileFolder'));
  let results: FileMoveResult[] | undefined;
  await act(async () => {
    results = await current.move(ids, null);
  });
  expect(mockTrigger).toHaveBeenCalledTimes(2);
  expect(results).toEqual([
    ...completed,
    ...ids.slice(MAX_FILE_MOVE_BATCH_SIZE).map((fileEntryId) => ({
      fileEntryId,
      status: 'failed',
      code: 'NOT_FOUND',
    })),
  ]);
  expect(current.progress).toBeNull();
  mockTrigger.mockImplementation(async ({ body }) => body.fileEntryIds.map(moved));
  const retryIds = results!
    .filter((result) => result.status === 'failed')
    .map((result) => result.fileEntryId);
  await act(async () => {
    expect(await current.move(retryIds, 'another')).toEqual(retryIds.map(moved));
  });
});

function moved(fileEntryId: string): FileMoveResult {
  return { fileEntryId, status: 'moved' };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
