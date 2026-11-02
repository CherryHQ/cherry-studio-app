import * as FileSystem from 'expo-file-system/legacy';

import { downloadFile, FileDownloadError } from '@/backend/services/download';
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
    try {
      if (!FileSystem.cacheDirectory) throw new Error('Update storage unavailable');
      const directory = `${FileSystem.cacheDirectory}app-updates/`;
      const expectedHash = await readApkChecksum(release, signal);
      await downloadFile({
        url: release.downloadUrl,
        destination: `${directory}update.apk`,
        sha256: expectedHash,
        maxBytes: MAX_APK_BYTES,
        timeoutMs: 30 * 60_000,
        signal,
        reuseCached,
        onProgress: (progress) => publish({ ...progress, release }),
      });
      return { status: 'ready', release };
    } catch (error) {
      if (signal.aborted && signal.reason?.name === 'AbortError') {
        return { status: 'idle' };
      } else {
        logger.warn('APK update transfer failed', { error });
        return {
          status: 'failed',
          release,
          reason:
            error instanceof FileDownloadError && error.code === 'verification'
              ? 'verification'
              : 'download',
        };
      }
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
    clearObsoleteFailure(releaseId: string | null) {
      if (!stopped && state.status === 'failed' && state.release.id !== releaseId) {
        publish({ status: 'idle' });
      }
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
