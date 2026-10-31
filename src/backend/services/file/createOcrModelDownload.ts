import * as FileSystem from 'expo-file-system/legacy';
import { AppState } from 'react-native';

import type { LocalOcrModelState } from '@/shared/contracts/localOcr';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { hashLocalFile } from './fileHash';
import {
  LOCAL_OCR_MODEL_BYTES,
  LOCAL_OCR_MODEL_FILES,
  LOCAL_OCR_MODEL_VERSION,
} from './localOcrModel';

const logger = loggerService.withContext('LocalOcrModel');

/** Owns persistent verified weights and one resumable native transfer, never model inference. */
export function createOcrModelDownload(isSupported: boolean) {
  const directory = `${FileSystem.documentDirectory}LocalModels/${LOCAL_OCR_MODEL_VERSION}/`;
  const listeners = new Set<(state: LocalOcrModelState) => void>();
  let state: LocalOcrModelState = {
    status: isSupported ? 'idle' : 'failed',
    receivedBytes: 0,
    totalBytes: LOCAL_OCR_MODEL_BYTES,
    reason: isSupported ? undefined : 'unavailable',
  };
  let active:
    | { kind: 'check' | 'download'; controller: AbortController; promise: Promise<void> }
    | undefined;
  let task: FileSystem.DownloadResumable | undefined;
  let pauseTask: Promise<void> | undefined;
  let initialized = false;
  let stopped = false;
  let pauseVersion = 0;

  function publish(
    status: LocalOcrModelState['status'],
    receivedBytes = state.receivedBytes,
    reason?: LocalOcrModelState['reason'],
  ) {
    state = { status, receivedBytes, totalBytes: LOCAL_OCR_MODEL_BYTES, reason };
    for (const listener of listeners) listener(state);
  }

  function start(
    kind: 'check' | 'download',
    work: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    if (stopped) return Promise.reject(new Error('Local OCR storage has stopped'));
    if (active) return active.promise;
    const controller = new AbortController();
    const promise = Promise.resolve()
      .then(() => work(controller.signal))
      .finally(() => {
        active = undefined;
        pauseTask = undefined;
      });
    active = { kind, controller, promise };
    return promise;
  }

  async function verifiedBytes(signal: AbortSignal): Promise<number> {
    let bytes = 0;
    for (const model of LOCAL_OCR_MODEL_FILES) {
      const uri = directory + model.name;
      const info = await FileSystem.getInfoAsync(uri);
      signal.throwIfAborted();
      if (!info.exists) continue;
      if (
        !info.isDirectory &&
        info.size === model.bytes &&
        (await hashLocalFile(uri, signal)) === model.sha256
      ) {
        bytes += model.bytes;
      } else {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    }
    return bytes;
  }

  async function ensureReady(): Promise<boolean> {
    if (!isSupported || stopped) return false;
    if (active) await active.promise;
    if (!initialized && !stopped) {
      await start('check', async (signal) => {
        publish('checking');
        try {
          if (!FileSystem.documentDirectory) throw new Error('Model storage unavailable');
          const bytes = await verifiedBytes(signal);
          const resumable = await Promise.all(
            LOCAL_OCR_MODEL_FILES.flatMap((model) => [
              FileSystem.getInfoAsync(`${directory}${model.name}.part`),
              FileSystem.getInfoAsync(`${directory}${model.name}.part.resume`),
            ]),
          );
          signal.throwIfAborted();
          publish(
            bytes === LOCAL_OCR_MODEL_BYTES
              ? 'ready'
              : bytes > 0 || resumable.some((info) => info.exists)
                ? 'paused'
                : 'idle',
            bytes,
          );
        } catch (error) {
          if (!signal.aborted) logger.warn('Local OCR model check failed', { error });
          publish('failed', 0, 'verification');
        } finally {
          initialized = true;
        }
      });
    }
    return !stopped && state.status === 'ready';
  }

  async function pause(): Promise<void> {
    pauseVersion += 1;
    const current = active;
    if (!current) return;
    // Join native pause before publishing paused or letting another download start.
    if (!pauseTask) {
      current.controller.abort();
      const transfer = task;
      pauseTask = (async () => {
        if (transfer) {
          try {
            const saved = await transfer.pauseAsync();
            await FileSystem.writeAsStringAsync(
              `${transfer.fileUri}.resume`,
              saved.resumeData ?? '',
            );
          } catch (error) {
            logger.warn('Local OCR transfer pause failed', { error });
            await transfer.cancelAsync().catch((cancelError: unknown) => {
              logger.warn('Local OCR transfer cancellation failed', { error: cancelError });
            });
          }
        }
      })();
    }
    await pauseTask;
    await current.promise;
  }

  async function download(): Promise<boolean> {
    if (!isSupported || stopped) return false;
    const version = pauseVersion;
    if (active?.kind === 'download') {
      await active.promise;
      return version === pauseVersion && state.status === 'ready' && !stopped;
    }
    if (await ensureReady()) return version === pauseVersion && !stopped;
    // A remove/pause may finish the startup check before this continuation is dispatched.
    if (version !== pauseVersion || stopped) return false;
    await start('download', async (signal) => {
      let phase: NonNullable<LocalOcrModelState['reason']> = 'storage';
      let completeBytes = 0;
      const subscription = AppState.addEventListener('change', (next) => {
        if (next !== 'active')
          void pause().catch((error: unknown) => logger.warn('Model pause failed', { error }));
      });
      try {
        if (!FileSystem.documentDirectory) throw new Error('Model storage unavailable');
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
        signal.throwIfAborted();
        completeBytes = await verifiedBytes(signal);
        const partials = await Promise.all(
          LOCAL_OCR_MODEL_FILES.map(async (model) => {
            const info = await FileSystem.getInfoAsync(`${directory}${model.name}.part`);
            return info.exists && !info.isDirectory ? Math.min(info.size, model.bytes) : 0;
          }),
        );
        const partialBytes = partials.reduce((sum, bytes) => sum + bytes, 0);
        if (
          (await FileSystem.getFreeDiskStorageAsync()) <
          LOCAL_OCR_MODEL_BYTES - completeBytes - partialBytes + 100_000_000
        )
          throw new Error('Insufficient model storage');
        for (const model of LOCAL_OCR_MODEL_FILES) {
          signal.throwIfAborted();
          const complete = directory + model.name;
          if ((await FileSystem.getInfoAsync(complete)).exists) continue;
          const partial = `${complete}.part`;
          const resumeFile = `${partial}.resume`;
          const previous = await FileSystem.getInfoAsync(partial);
          // A completed transfer interrupted during hashing only needs verification on retry.
          if (!previous.exists || previous.isDirectory || previous.size !== model.bytes) {
            let resumeData: string | undefined;
            if ((await FileSystem.getInfoAsync(resumeFile)).exists) {
              resumeData = (await FileSystem.readAsStringAsync(resumeFile)) || undefined;
            }
            // A crash without a saved native resume token must restart this file, not append bytes.
            if (!resumeData) await FileSystem.deleteAsync(partial, { idempotent: true });
            signal.throwIfAborted();
            phase = 'download';
            let lastPercent = -1;
            let oversize = false;
            publish('downloading', completeBytes);
            task = FileSystem.createDownloadResumable(
              model.url,
              partial,
              {},
              (progress) => {
                if (signal.aborted) return;
                if (
                  progress.totalBytesWritten > model.bytes ||
                  progress.totalBytesExpectedToWrite > model.bytes
                ) {
                  if (!oversize) {
                    oversize = true;
                    void task
                      ?.cancelAsync()
                      .catch((error: unknown) =>
                        logger.warn('Oversized model cancellation failed', { error }),
                      );
                  }
                  return;
                }
                const received = Math.min(progress.totalBytesWritten, model.bytes);
                const percent = Math.floor((received / model.bytes) * 100);
                if (percent !== lastPercent) {
                  lastPercent = percent;
                  publish('downloading', completeBytes + received);
                }
              },
              resumeData,
            );
            const response = await (resumeData ? task.resumeAsync() : task.downloadAsync());
            signal.throwIfAborted();
            if (oversize) throw new Error('Model exceeds the expected size');
            if (!response || response.status < 200 || response.status >= 300)
              throw new Error('Model download failed');
            // Releases Expo's progress listener after successful completion.
            await task.cancelAsync();
            task = undefined;
          }
          phase = 'verification';
          publish('verifying', completeBytes + model.bytes);
          const info = await FileSystem.getInfoAsync(partial);
          if (
            !info.exists ||
            info.isDirectory ||
            info.size !== model.bytes ||
            (await hashLocalFile(partial, signal)) !== model.sha256
          ) {
            await FileSystem.deleteAsync(partial, { idempotent: true });
            await FileSystem.deleteAsync(resumeFile, { idempotent: true });
            throw new Error('Model checksum mismatch');
          }
          signal.throwIfAborted();
          await FileSystem.moveAsync({ from: partial, to: complete });
          await FileSystem.deleteAsync(resumeFile, { idempotent: true });
          completeBytes += model.bytes;
        }
        signal.throwIfAborted();
        initialized = true;
        publish('ready', LOCAL_OCR_MODEL_BYTES);
      } catch (error) {
        if (signal.aborted) {
          await pauseTask;
          publish('paused');
        } else {
          logger.warn('Local OCR model download failed', { error });
          publish('failed', completeBytes, phase);
          // A failed resume token is not reusable. Completed files remain verified and reusable.
          if (task) {
            await task.cancelAsync().catch(() => undefined);
            await FileSystem.deleteAsync(`${task.fileUri}.resume`, { idempotent: true });
          }
        }
      } finally {
        subscription.remove();
        task = undefined;
      }
    });
    return version === pauseVersion && state.status === 'ready' && !stopped;
  }

  return {
    ensureReady,
    isReady: () => state.status === 'ready' && !stopped,
    download,
    pause,
    paths: () => ({ model: directory + 'model.gguf', vision: directory + 'vision.gguf' }),
    observe(observer: (state: LocalOcrModelState) => void) {
      listeners.add(observer);
      observer(state);
      void ensureReady().catch((error: unknown) =>
        logger.warn('Model initialization failed', { error }),
      );
      return () => {
        listeners.delete(observer);
      };
    },
    async remove() {
      await pause();
      await FileSystem.deleteAsync(directory, { idempotent: true });
      initialized = true;
      publish('idle', 0);
    },
    async dispose() {
      stopped = true;
      await pause();
      listeners.clear();
    },
  };
}
