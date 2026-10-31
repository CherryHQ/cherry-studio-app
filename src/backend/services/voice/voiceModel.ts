import * as FileSystem from 'expo-file-system/legacy';

import { downloadFile, FileDownloadError } from '@/backend/services/download';
import { hashLocalFile } from '@/backend/services/file/fileHash';
import { VoiceError, type VoiceModelModule, type VoiceModelState } from '@/shared/contracts/voice';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { getVoiceInput } from '../../../../modules/voice-input';
import { SENSE_VOICE_ASSETS, SENSE_VOICE_BYTES, SENSE_VOICE_DIRECTORY } from './senseVoiceAssets';

const logger = loggerService.withContext('VoiceModel');

/** One app generation owns download, verification and deletion. No startup work until requested. */
export function createVoiceModel() {
  let state: VoiceModelState = {
    status: 'not-downloaded',
    receivedBytes: 0,
    totalBytes: SENSE_VOICE_BYTES,
  };
  const listeners = new Set<() => void>();
  let active:
    | { status: VoiceModelState['status']; controller: AbortController; promise: Promise<void> }
    | undefined;
  let stopped = false;
  let verified = false;
  let leases = 0;

  function publish(
    status: VoiceModelState['status'],
    receivedBytes = state.receivedBytes,
    failure?: VoiceModelState['failure'],
  ) {
    if (
      state.status === status &&
      state.receivedBytes === receivedBytes &&
      state.failure === failure
    )
      return;
    state = {
      status,
      receivedBytes,
      totalBytes: SENSE_VOICE_BYTES,
      ...(failure ? { failure } : {}),
    };
    listeners.forEach((listener) => listener());
  }

  async function directory() {
    const native = getVoiceInput();
    if (!native)
      throw new VoiceError('unsupported', 'Offline voice needs a compatible native client.');
    return `${(await native.modelDirectory()).replace(/\/$/, '')}/${SENSE_VOICE_DIRECTORY}/`;
  }

  async function inspect(signal: AbortSignal) {
    const root = await directory();
    let received = 0;
    for (const asset of SENSE_VOICE_ASSETS) {
      signal.throwIfAborted();
      const uri = `${root}${asset.name}`;
      const file = await FileSystem.getInfoAsync(uri);
      if (
        file.exists &&
        !file.isDirectory &&
        file.size === asset.bytes &&
        (verified || (await hashLocalFile(uri, signal)) === asset.sha256)
      )
        received += asset.bytes;
    }
    signal.throwIfAborted();
    verified = received === SENSE_VOICE_BYTES;
    publish(verified ? 'ready' : 'not-downloaded', received);
  }

  function run(
    status: VoiceModelState['status'],
    operation: (signal: AbortSignal) => Promise<void>,
  ) {
    if (stopped) return Promise.reject(new Error('Voice model owner has stopped'));
    if (active)
      return active.status === status || status === 'checking'
        ? active.promise
        : Promise.reject(new VoiceError('busy', 'The offline model is busy.'));
    const controller = new AbortController();
    const previous = state;
    publish(status);
    const promise = Promise.resolve()
      .then(() => operation(controller.signal))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          // Completed files remain reusable. A later refresh reconciles them before use.
          publish(previous.status === 'ready' ? 'ready' : 'not-downloaded');
          return;
        }
        verified = false;
        logger.warn('Offline model operation failed', { error });
        publish(
          'failed',
          state.receivedBytes,
          error instanceof FileDownloadError
            ? error.code === 'verification'
              ? 'verification'
              : 'download'
            : 'storage',
        );
        throw error;
      })
      .finally(() => {
        active = undefined;
      });
    active = { status, controller, promise };
    return promise;
  }

  const module: VoiceModelModule = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh() {
      if (leases) return Promise.resolve();
      return run('checking', inspect);
    },
    download() {
      if (leases)
        return Promise.reject(new VoiceError('busy', 'The offline recognizer is in use.'));
      return run('downloading', async (signal) => {
        const root = await directory();
        let completed = 0;
        for (const asset of SENSE_VOICE_ASSETS) {
          signal.throwIfAborted();
          publish('downloading', completed);
          await downloadFile({
            url: asset.url,
            destination: `${root}${asset.name}`,
            sha256: asset.sha256,
            bytes: asset.bytes,
            maxBytes: asset.bytes,
            timeoutMs: 30 * 60_000,
            signal,
            onProgress(progress) {
              publish(
                progress.status,
                completed +
                  (progress.status === 'downloading' ? progress.receivedBytes : asset.bytes),
              );
            },
          });
          completed += asset.bytes;
        }
        signal.throwIfAborted();
        verified = true;
        publish('ready', SENSE_VOICE_BYTES);
      });
    },
    async cancel() {
      const current = active;
      current?.controller.abort();
      await current?.promise.catch(() => {});
    },
    remove() {
      if (leases || active)
        return Promise.reject(new VoiceError('busy', 'The offline model is busy.'));
      return run('removing', async (signal) => {
        const root = await directory();
        signal.throwIfAborted();
        verified = false;
        await FileSystem.deleteAsync(root, { idempotent: true });
        publish('not-downloaded', 0);
      });
    },
  };

  return {
    module,
    async isReady(signal: AbortSignal) {
      signal.throwIfAborted();
      if (state.status === 'failed') return false;
      if (active && active.status !== 'checking') return false;
      await module.refresh();
      signal.throwIfAborted();
      return state.status === 'ready';
    },
    async acquire(signal: AbortSignal) {
      if (active?.status === 'checking') await active.promise;
      signal.throwIfAborted();
      if (stopped || active || !verified)
        throw new VoiceError('model-not-downloaded', 'The offline model is not ready.');
      // Reserve before resolving the path, so deletion cannot race native initialization.
      leases++;
      try {
        const root = await directory();
        signal.throwIfAborted();
        return {
          directory: root,
          release: () => {
            leases--;
          },
        };
      } catch (error) {
        leases--;
        throw error;
      }
    },
    async dispose() {
      stopped = true;
      await module.cancel();
      listeners.clear();
    },
  };
}

export type VoiceModel = ReturnType<typeof createVoiceModel>;
