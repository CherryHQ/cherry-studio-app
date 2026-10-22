import * as FileSystem from 'expo-file-system/legacy';

import { hashLocalFile } from '@/backend/services/file/fileHash';
import type { ApkUpdateRelease } from '@/shared/contracts/appUpdate';

import { createApkDownload } from '../createApkDownload';
import { readApkChecksum } from '../gitcodeRelease';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  moveAsync: jest.fn(async () => {}),
  getInfoAsync: jest.fn(),
  createDownloadResumable: jest.fn(),
}));
jest.mock('@/backend/services/file/fileHash', () => ({ hashLocalFile: jest.fn() }));
jest.mock('../gitcodeRelease', () => ({ readApkChecksum: jest.fn() }));
const hash = 'a'.repeat(64);
const release: ApkUpdateRelease = {
  channel: 'apk',
  id: 'apk:2.0.0',
  currentVersion: '1.0.0',
  latestVersion: '2.0.0',
  downloadUrl:
    'https://gitcode.com/CherryHQ/cherry-studio-app/releases/download/v2.0.0/cherry-studio-2.0.0-android.apk',
  checksumUrl: 'https://gitcode.com/CherryHQ/cherry-studio-app/releases/download/v2.0.0/SHA256SUMS',
};
const mockTask = { downloadAsync: jest.fn(), cancelAsync: jest.fn(async () => {}) };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readApkChecksum).mockResolvedValue(hash);
  jest.mocked(hashLocalFile).mockResolvedValue(hash);
  jest
    .mocked(FileSystem.getInfoAsync)
    .mockImplementation(async (uri) =>
      uri.endsWith('update.apk')
        ? { exists: false, isDirectory: false, uri }
        : { exists: true, isDirectory: false, uri, size: 100, modificationTime: 1 },
    );
  mockTask.downloadAsync.mockResolvedValue({ status: 200 });
  mockTask.cancelAsync.mockImplementation(async () => {});
  jest
    .mocked(FileSystem.createDownloadResumable)
    .mockReturnValue(mockTask as unknown as FileSystem.DownloadResumable);
});

test('deduplicates concurrent requests and publishes ready only after verification and cleanup', async () => {
  const updates = createApkDownload();
  const states: string[] = [];
  const unsubscribe = updates.subscribeDownload(() => states.push(updates.getDownload().status));
  const first = updates.download(release);
  expect(updates.download(release)).toBe(first);
  await first;
  expect(FileSystem.createDownloadResumable).toHaveBeenCalledTimes(1);
  expect(hashLocalFile).toHaveBeenCalledWith(
    'file:///cache/app-updates/pending.apk',
    expect.any(AbortSignal),
  );
  expect(FileSystem.moveAsync).toHaveBeenCalledWith({
    from: 'file:///cache/app-updates/pending.apk',
    to: 'file:///cache/app-updates/update.apk',
  });
  expect(states).toEqual(['downloading', 'verifying', 'ready']);
  expect(mockTask.cancelAsync).toHaveBeenCalledTimes(1);
  unsubscribe();
  await updates.dispose();
});

test('checksum mismatch cannot become installable and retry starts a new transfer', async () => {
  jest.mocked(hashLocalFile).mockResolvedValueOnce('b'.repeat(64));
  const updates = createApkDownload();
  await updates.download(release);
  expect(updates.getDownload()).toEqual({ status: 'failed', release, reason: 'verification' });
  expect(FileSystem.moveAsync).not.toHaveBeenCalled();
  await updates.download(release);
  expect(FileSystem.createDownloadResumable).toHaveBeenCalledTimes(2);
  expect(updates.getDownload().status).toBe('ready');
});

test('HTTP failure is not treated as a downloaded APK', async () => {
  mockTask.downloadAsync.mockResolvedValue({ status: 404 });
  const updates = createApkDownload();
  await updates.download(release);
  expect(updates.getDownload()).toEqual({ status: 'failed', release, reason: 'download' });
  expect(FileSystem.moveAsync).not.toHaveBeenCalled();
});

test('a completed cached file is reverified before reuse', async () => {
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({
    exists: true,
    isDirectory: false,
    uri: 'file:///cache/app-updates/update.apk',
    size: 100,
    modificationTime: 1,
  });
  const updates = createApkDownload();
  await updates.download(release);
  expect(hashLocalFile).toHaveBeenCalledWith(
    'file:///cache/app-updates/update.apk',
    expect.any(AbortSignal),
  );
  expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
  expect(updates.getDownload().status).toBe('ready');
});

test('cancellation during metadata loading joins cleanup without claiming failure or readiness', async () => {
  jest.mocked(readApkChecksum).mockImplementation(
    (_release, signal) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        if (signal.aborted) reject(signal.reason);
      }),
  );
  const updates = createApkDownload();
  const pending = updates.download(release);
  await Promise.resolve();
  await updates.cancelDownload();
  await pending;
  expect(updates.getDownload()).toEqual({ status: 'idle' });
  expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/app-updates/pending.apk', {
    idempotent: true,
  });
});

test('disposal rejects new transfers', async () => {
  const updates = createApkDownload();
  await updates.dispose();
  await expect(updates.download(release)).rejects.toThrow('stopped');
});

test('native package rejection forces a fresh download instead of reusing the rejected file', async () => {
  const updates = createApkDownload();
  await updates.download(release);
  updates.invalidateReady();
  expect(updates.getDownload()).toEqual({ status: 'failed', release, reason: 'verification' });
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({
    exists: true,
    isDirectory: false,
    uri: 'file:///cache/app-updates/update.apk',
    size: 100,
    modificationTime: 1,
  });
  await updates.download(release);
  expect(FileSystem.createDownloadResumable).toHaveBeenCalledTimes(2);
});
