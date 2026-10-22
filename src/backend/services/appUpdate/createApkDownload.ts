import * as FileSystem from 'expo-file-system/legacy';

import { hashLocalFile } from '@/backend/services/file/fileHash';
import type { ApkUpdateRelease, AppUpdateDownload } from '@/shared/contracts/appUpdate';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { readApkChecksum } from './gitcodeRelease';

const MAX_APK_BYTES = 1024 * 1024 * 1024;
const logger = loggerService.withContext('AppUpdate');

/** One transfer per app generation. Route unmount unsubscribes; bootstrap disposal cancels and joins. */
export function createApkDownload() {
  let state: AppUpdateDownload = { status: 'idle' };
  const listeners = new Set<() => void>();
  let active: { controller: AbortController; promise: Promise<void> } | undefined;
  let stopped = false;
  let reuseCached = true;

  function publish(next: AppUpdateDownload) {
    state = next;
    for (const listener of listeners) listener();
  }

  async function transfer(
    release: ApkUpdateRelease,
    controller: AbortController,
  ): Promise<AppUpdateDownload> {
    const { signal } = controller;
    let pending: string | undefined;
    let task: FileSystem.DownloadResumable | undefined;
    let verification = false;
    let cancelTask: Promise<void> | undefined;
    const cancel = () => {
      cancelTask ??= task?.cancelAsync().catch((error: unknown) => {
        logger.warn('APK transfer cancellation failed', { error });
      });
    };
    const timeout = setTimeout(
      () => controller.abort(new Error('APK download timed out')),
      30 * 60_000,
    );
    signal.addEventListener('abort', cancel, { once: true });
    try {
      if (!FileSystem.cacheDirectory) throw new Error('Update storage unavailable');
      const directory = `${FileSystem.cacheDirectory}app-updates/`;
      pending = `${directory}pending.apk`;
      const complete = `${directory}update.apk`;
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      signal.throwIfAborted();
      const expectedHash = await readApkChecksum(release, signal);
      const previous = await FileSystem.getInfoAsync(complete);
      // A completed file survives process exit; reuse it only after fresh checksum verification.
      if (
        reuseCached &&
        previous.exists &&
        !previous.isDirectory &&
        (await hashLocalFile(complete, signal)) === expectedHash
      ) {
        return { status: 'ready', release };
      }
      await FileSystem.deleteAsync(complete, { idempotent: true });
      await FileSystem.deleteAsync(pending, { idempotent: true });
      signal.throwIfAborted();
      let lastPercent = -1;
      let lastPublish = 0;
      task = FileSystem.createDownloadResumable(release.downloadUrl, pending, {}, (progress) => {
        if (signal.aborted) return;
        const receivedBytes = progress.totalBytesWritten;
        const totalBytes =
          progress.totalBytesExpectedToWrite > 0 ? progress.totalBytesExpectedToWrite : null;
        if (receivedBytes > MAX_APK_BYTES || (totalBytes !== null && totalBytes > MAX_APK_BYTES)) {
          controller.abort(new Error('APK exceeds download limit'));
          return;
        }
        const percent = totalBytes === null ? -1 : Math.floor((receivedBytes / totalBytes) * 100);
        if (percent !== lastPercent || Date.now() - lastPublish >= 500) {
          lastPercent = percent;
          lastPublish = Date.now();
          publish({ status: 'downloading', release, receivedBytes, totalBytes });
        }
      });
      const response = await task.downloadAsync();
      signal.throwIfAborted();
      if (!response || response.status < 200 || response.status >= 300)
        throw new Error('APK download failed');
      const downloaded = await FileSystem.getInfoAsync(pending);
      if (
        !downloaded.exists ||
        downloaded.isDirectory ||
        downloaded.size <= 0 ||
        downloaded.size > MAX_APK_BYTES
      ) {
        throw new Error('Invalid APK download size');
      }
      verification = true;
      publish({ status: 'verifying', release });
      if ((await hashLocalFile(pending, signal)) !== expectedHash)
        throw new Error('APK checksum mismatch');
      signal.throwIfAborted();
      await FileSystem.moveAsync({ from: pending, to: complete });
      signal.throwIfAborted();
      return { status: 'ready', release };
    } catch (error) {
      if (signal.aborted && signal.reason?.name === 'AbortError') {
        return { status: 'idle' };
      } else {
        logger.warn('APK update transfer failed', { error });
        return { status: 'failed', release, reason: verification ? 'verification' : 'download' };
      }
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      // Legacy FileSystem retains its progress listener after success; cancel releases it too.
      cancel();
      await cancelTask;
      if (pending)
        await FileSystem.deleteAsync(pending, { idempotent: true }).catch((error: unknown) => {
          logger.warn('APK partial-file cleanup failed', { error });
        });
    }
  }

  return {
    getDownload: () => state,
    subscribeDownload(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    download(release: ApkUpdateRelease): Promise<void> {
      if (stopped) return Promise.reject(new Error('App updates have stopped'));
      if (active) return active.promise;
      const controller = new AbortController();
      publish({ status: 'downloading', release, receivedBytes: 0, totalBytes: null });
      const promise = transfer(release, controller).then((outcome) => {
        active = undefined;
        if (outcome.status === 'ready') reuseCached = true;
        publish(
          controller.signal.aborted && controller.signal.reason?.name === 'AbortError'
            ? { status: 'idle' }
            : outcome,
        );
      });
      active = { controller, promise };
      return promise;
    },
    async cancelDownload() {
      const current = active;
      current?.controller.abort();
      await current?.promise;
    },
    invalidateReady() {
      if (state.status !== 'ready') return;
      reuseCached = false;
      publish({ status: 'failed', release: state.release, reason: 'verification' });
    },
    async dispose() {
      stopped = true;
      active?.controller.abort();
      await active?.promise;
      listeners.clear();
    },
  };
}
