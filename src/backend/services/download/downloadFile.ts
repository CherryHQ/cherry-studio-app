import * as FileSystem from 'expo-file-system/legacy';

import { hashLocalFile } from '@/backend/services/file/fileHash';
import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import { loggerService } from '@/shared/core/logger/LoggerService';

export type FileDownloadProgress =
  | { status: 'downloading'; receivedBytes: number; totalBytes: number | null }
  | { status: 'verifying' };

export class FileDownloadError extends Error {
  constructor(readonly code: 'download' | 'verification' | 'invalid-request' | 'busy') {
    super(`File download failed: ${code}`);
    this.name = 'FileDownloadError';
  }
}

type FileDownloadOptions = {
  url: string;
  destination: string;
  sha256: string;
  /** Known model assets also require an exact byte count. */
  bytes?: number;
  maxBytes: number;
  timeoutMs: number;
  signal: AbortSignal;
  onProgress?(progress: FileDownloadProgress): void;
  reuseCached?: boolean;
};

const destinations = new Set<string>();
const logger = loggerService.withContext('FileDownload');

/**
 * Caller-owned native transfer. No file bytes cross JS; only verified files are published.
 * The caller owns retry/mirror policy, storage lifetime and joining cancellation on disposal.
 */
export async function downloadFile(options: FileDownloadOptions): Promise<string> {
  const { destination, sha256, bytes, maxBytes, timeoutMs, onProgress } = options;
  let url: URL;
  try {
    url = new URL(options.url);
  } catch {
    throw new FileDownloadError('invalid-request');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !destination.startsWith('file:///') ||
    destination.endsWith('/') ||
    !/^[a-f0-9]{64}$/.test(sha256) ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    (bytes !== undefined && (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > maxBytes))
  )
    throw new FileDownloadError('invalid-request');
  options.signal.throwIfAborted();
  if (destinations.has(destination)) throw new FileDownloadError('busy');
  destinations.add(destination);
  const controller = new AbortController();
  const linked = linkAbortSignals([options.signal, controller.signal]);
  const { signal } = linked;
  const timeout = setTimeout(() => controller.abort(new FileDownloadError('download')), timeoutMs);
  const partial = `${destination}.part`;
  let task: FileSystem.DownloadResumable | undefined;
  let cancellation: Promise<void> | undefined;
  let verifying = false;
  const cancel = () => {
    cancellation ??= task?.cancelAsync().catch(() => {
      logger.warn('Native download cleanup failed');
    });
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    await FileSystem.makeDirectoryAsync(destination.slice(0, destination.lastIndexOf('/') + 1), {
      intermediates: true,
    });
    signal.throwIfAborted();
    const cached = await FileSystem.getInfoAsync(destination);
    if (
      options.reuseCached !== false &&
      cached.exists &&
      !cached.isDirectory &&
      cached.size > 0 &&
      cached.size <= maxBytes &&
      (bytes === undefined || cached.size === bytes) &&
      (await hashLocalFile(destination, signal)) === sha256
    ) {
      signal.throwIfAborted();
      return destination;
    }
    // A killed transfer may leave a partial file. It is never admitted as a completed asset.
    await FileSystem.deleteAsync(partial, { idempotent: true });
    signal.throwIfAborted();
    let lastPercent = -1;
    let lastPublish = 0;
    task = FileSystem.createDownloadResumable(options.url, partial, {}, (progress) => {
      if (signal.aborted) return;
      const receivedBytes = progress.totalBytesWritten;
      const reportedTotal = progress.totalBytesExpectedToWrite;
      const totalBytes = bytes ?? (reportedTotal > 0 ? reportedTotal : null);
      if (receivedBytes > (bytes ?? maxBytes) || reportedTotal > maxBytes) {
        controller.abort(new FileDownloadError('download'));
        return;
      }
      const percent = totalBytes ? Math.floor((receivedBytes / totalBytes) * 100) : -1;
      if (percent !== lastPercent || Date.now() - lastPublish >= 500) {
        lastPercent = percent;
        lastPublish = Date.now();
        onProgress?.({ status: 'downloading', receivedBytes, totalBytes });
      }
    });
    const response = await task.downloadAsync();
    signal.throwIfAborted();
    if (!response || response.status < 200 || response.status >= 300)
      throw new FileDownloadError('download');
    const file = await FileSystem.getInfoAsync(partial);
    if (!file.exists || file.isDirectory || file.size <= 0 || file.size > maxBytes)
      throw new FileDownloadError('download');
    verifying = true;
    onProgress?.({ status: 'verifying' });
    if (
      (bytes !== undefined && file.size !== bytes) ||
      (await hashLocalFile(partial, signal)) !== sha256
    )
      throw new FileDownloadError('verification');
    signal.throwIfAborted();
    await FileSystem.deleteAsync(destination, { idempotent: true });
    signal.throwIfAborted();
    await FileSystem.moveAsync({ from: partial, to: destination });
    signal.throwIfAborted();
    return destination;
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof FileDownloadError) throw error;
    throw new FileDownloadError(verifying ? 'verification' : 'download');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
    // Legacy FileSystem keeps the progress listener even after success.
    cancel();
    await cancellation;
    await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => {
      logger.warn('Partial download cleanup failed');
    });
    linked.dispose();
    destinations.delete(destination);
  }
}
