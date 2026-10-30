import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { TurboModuleRegistry } from 'react-native';

import { VoiceError } from '@/shared/contracts/voice';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { getVoiceInput, type VoiceRecordingResult } from '../../../../modules/voice-input';
import type { DictationEngine } from './engines';
import { requireAccess, type SystemPromptQueue } from './microphoneAccess';
import type { VoiceModel } from './voiceModel';

const logger = loggerService.withContext('SenseVoice');

/** Native batch recognition; only the final transcript crosses the public voice boundary. */
export function createSenseVoiceDictationEngine(
  model: VoiceModel,
  permissions: SystemPromptQueue,
): DictationEngine {
  function available() {
    return !!getVoiceInput() && !!TurboModuleRegistry.get('SherpaOnnx');
  }
  return {
    async status(signal) {
      if (!available()) return 'unsupported';
      try {
        return (await model.isReady(signal)) ? 'ready' : 'needs-model';
      } catch {
        signal.throwIfAborted();
        return 'needs-model';
      }
    },
    async start({ signal, onText, onLevel, onTranscribing }) {
      const native = getVoiceInput();
      if (!native || !available())
        throw new VoiceError('unsupported', 'Offline dictation is unavailable.');
      await requireAccess(
        permissions,
        {
          get: getRecordingPermissionsAsync,
          request: requestRecordingPermissionsAsync,
        },
        signal,
      );
      signal.throwIfAborted();
      const lease = await model.acquire(signal);
      const id = randomUUID();
      let audioUri: string | undefined;
      let sherpa: typeof import('@siteed/sherpa-onnx.rn') | undefined;
      let complete!: (event: VoiceRecordingResult) => void;
      const recording = new Promise<VoiceRecordingResult>((resolve) => {
        complete = resolve;
      });
      const finished = native.addListener('finished', (event) => {
        if (event.id !== id) return;
        audioUri = event.uri;
        complete(event);
      });
      const level = native.addListener('level', (event) => {
        if (event.id === id && !signal.aborted) onLevel(event.value);
      });
      const abort = () => {
        void native.cancel(id).catch(() => {
          logger.warn('Recording cancellation failed');
        });
        complete({ id, error: 'cancelled' });
      };
      signal.addEventListener('abort', abort, { once: true });
      async function cleanup() {
        signal.removeEventListener('abort', abort);
        try {
          await native!.cancel(id);
        } catch {
          logger.warn('Recording cleanup failed');
        }
        finished.remove();
        level.remove();
        try {
          // Release only after any in-flight inference has settled; native decode is not interruptible.
          await sherpa?.ASR.release();
        } catch {
          logger.warn('Offline recognizer cleanup failed');
        }
        if (audioUri) {
          try {
            // The legacy delete API checks `<file>/..`, which fails for iOS temporary files.
            const audio = new File(audioUri);
            if (audio.exists) audio.delete();
          } catch {
            logger.warn('Temporary voice audio cleanup failed');
          }
        }
        lease.release();
      }
      try {
        signal.throwIfAborted();
        // Older development clients can still use system voice; never import this at startup.
        sherpa =
          // eslint-disable-next-line @typescript-eslint/no-require-imports -- old clients lack this native module
          require('@siteed/sherpa-onnx.rn') as typeof import('@siteed/sherpa-onnx.rn');
        signal.throwIfAborted();
        const initialized = await sherpa.ASR.initialize({
          modelDir: decodeURIComponent(new URL(lease.directory).pathname),
          modelType: 'sense_voice',
          modelFiles: { model: 'model.int8.onnx', tokens: 'tokens.txt' },
          numThreads: 2,
          provider: 'cpu',
          streaming: false,
          language: 'auto',
          useItn: true,
        });
        if (!initialized.success)
          throw new VoiceError('failed', 'Offline recognizer initialization failed.');
        signal.throwIfAborted();
        await native.start(id);
        signal.throwIfAborted();
      } catch (error) {
        await cleanup();
        signal.throwIfAborted();
        if (error instanceof VoiceError) throw error;
        throw new VoiceError('failed', 'Offline dictation could not start.', { cause: error });
      }
      const recognizer = sherpa.ASR;
      const result = (async () => {
        try {
          const captured = await recording;
          signal.throwIfAborted();
          if (captured.error || !captured.uri)
            throw new VoiceError(
              captured.error === 'no-speech' ? 'no-speech' : 'failed',
              'Offline recording failed.',
            );
          onTranscribing?.();
          const recognized = await recognizer.recognizeFromFile(
            decodeURIComponent(new URL(captured.uri).pathname),
          );
          signal.throwIfAborted();
          if (!recognized.success) throw new VoiceError('failed', 'Offline recognition failed.');
          // SenseVoice may return language, emotion and audio-event markers around the transcript.
          const text = (recognized.text ?? '').replace(/<\|[^|]*\|>/g, '').trim();
          if (!text) throw new VoiceError('no-speech', 'No speech was recognized.');
          onText(text);
          return text;
        } catch (error) {
          signal.throwIfAborted();
          if (error instanceof VoiceError) throw error;
          throw new VoiceError('failed', 'Offline recognition failed.', { cause: error });
        } finally {
          await cleanup();
        }
      })();
      return {
        result,
        stop() {
          void native.stop(id).catch(() => {
            complete({ id, error: 'recording-failed' });
          });
        },
      };
    },
  };
}
