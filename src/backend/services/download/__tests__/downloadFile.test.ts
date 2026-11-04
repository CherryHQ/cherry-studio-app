import * as FileSystem from 'expo-file-system/legacy';

import { hashLocalFile } from '@/backend/services/file/fileHash';

import { downloadFile } from '../downloadFile';

jest.mock('expo-file-system/legacy', () => ({
  makeDirectoryAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  moveAsync: jest.fn(async () => {}),
  getInfoAsync: jest.fn(),
  createDownloadResumable: jest.fn(),
}));
jest.mock('@/backend/services/file/fileHash', () => ({ hashLocalFile: jest.fn() }));

const destination = 'file:///models/model.onnx';
const digest = 'a'.repeat(64);
const task = { downloadAsync: jest.fn(), cancelAsync: jest.fn(async () => {}) };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const options = (signal = new AbortController().signal) => ({
  url: 'https://example.com/model.onnx',
  destination,
  sha256: digest,
  bytes: 100,
  maxBytes: 100,
  timeoutMs: 60_000,
  signal,
});

beforeEach(() => {
  jest.clearAllMocks();
  task.downloadAsync.mockResolvedValue({ status: 200 });
  task.cancelAsync.mockImplementation(async () => {});
  jest.mocked(hashLocalFile).mockResolvedValue(digest);
  jest
    .mocked(FileSystem.getInfoAsync)
    .mockImplementation(async (uri) =>
      uri === destination
        ? { exists: false, isDirectory: false, uri }
        : { exists: true, isDirectory: false, uri, size: 100, modificationTime: 1 },
    );
  jest
    .mocked(FileSystem.createDownloadResumable)
    .mockReturnValue(task as unknown as FileSystem.DownloadResumable);
});

test('publishes a verified file only after hashing, and joins native cleanup', async () => {
  let finishHash!: (value: string) => void;
  jest.mocked(hashLocalFile).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishHash = resolve;
      }),
  );
  let finishCleanup!: () => void;
  task.cancelAsync.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishCleanup = resolve;
      }),
  );
  const progress: string[] = [];
  let settled = false;
  const work = downloadFile({
    ...options(),
    onProgress: (value) => progress.push(value.status),
  }).then(() => {
    settled = true;
  });
  await flush();
  expect(progress).toEqual(['verifying']);
  expect(FileSystem.moveAsync).not.toHaveBeenCalled();
  finishHash(digest);
  await flush();
  expect(FileSystem.moveAsync).toHaveBeenCalledWith({
    from: `${destination}.part`,
    to: destination,
  });
  expect(settled).toBe(false);
  finishCleanup();
  await work;
});

test('hash mismatch cannot replace an installed asset', async () => {
  jest.mocked(hashLocalFile).mockResolvedValue('b'.repeat(64));
  await expect(downloadFile(options())).rejects.toMatchObject({ code: 'verification' });
  expect(FileSystem.moveAsync).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(destination, expect.anything());
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`${destination}.part`, { idempotent: true });
});

test('exact length is checked even when the response is successful', async () => {
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({
    exists: true,
    isDirectory: false,
    uri: destination,
    size: 99,
    modificationTime: 1,
  });
  await expect(downloadFile(options())).rejects.toMatchObject({ code: 'verification' });
  expect(FileSystem.moveAsync).not.toHaveBeenCalled();
});

test('cached files must pass checksum verification before reuse', async () => {
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({
    exists: true,
    isDirectory: false,
    uri: destination,
    size: 100,
    modificationTime: 1,
  });
  await expect(downloadFile(options())).resolves.toBe(destination);
  expect(hashLocalFile).toHaveBeenCalledWith(destination, expect.any(AbortSignal));
  expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
});

test('cancellation keeps a late successful transfer from publishing and excludes concurrent writers', async () => {
  const controller = new AbortController();
  let finish!: (value: { status: number }) => void;
  task.downloadAsync.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const work = downloadFile(options(controller.signal));
  const rejected = expect(work).rejects.toMatchObject({ name: 'AbortError' });
  await flush();
  await expect(downloadFile(options())).rejects.toMatchObject({ code: 'busy' });
  controller.abort();
  finish({ status: 200 });
  await rejected;
  expect(FileSystem.moveAsync).not.toHaveBeenCalled();
  expect(task.cancelAsync).toHaveBeenCalledTimes(1);
  task.downloadAsync.mockResolvedValue({ status: 200 });
  await expect(downloadFile(options())).resolves.toBe(destination);
});

test('oversized progress aborts a native transfer before it can publish', async () => {
  task.downloadAsync.mockImplementation(async () => {
    const callback = jest.mocked(FileSystem.createDownloadResumable).mock.calls[0][3]!;
    callback({ totalBytesWritten: 101, totalBytesExpectedToWrite: -1 });
    return { status: 200 };
  });
  await expect(downloadFile(options())).rejects.toMatchObject({ code: 'download' });
  expect(FileSystem.moveAsync).not.toHaveBeenCalled();
});

test.each(['invalid', 'http://example.com/model', 'https://user:secret@example.com/model'])(
  'rejects an invalid source before touching storage: %s',
  async (url) => {
    await expect(downloadFile({ ...options(), url })).rejects.toMatchObject({
      code: 'invalid-request',
    });
    expect(FileSystem.makeDirectoryAsync).not.toHaveBeenCalled();
  },
);
