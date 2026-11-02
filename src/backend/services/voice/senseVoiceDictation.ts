import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';

import { VoiceError } from '@/shared/contracts/voice';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { getVoiceInput, type VoiceRecordingResult } from '../../../../modules/voice-input';
import type { DictationEngine } from './engines';
import { requireAccess, type SystemPromptQueue } from './microphoneAccess';
import {
  getSenseVoiceStatus,
  isSenseVoiceAvailable,
  openSenseVoiceRecognizer,
} from './senseVoiceRecognition';
import type { VoiceModel } from './voiceModel';

const logger = loggerService.withContext('SenseVoice');

/** Native batch recognition; only the final transcript crosses the public voice boundary. */
export function createSenseVoiceDictationEngine(
  model: VoiceModel,
  permissions: SystemPromptQueue,
): DictationEngine {
  return {
    status: (signal) => getSenseVoiceStatus(model, signal),
    async start({ signal, onText, onLevel, onTranscribing }) {
      const native = getVoiceInput();
      if (!native || !isSenseVoiceAvailable())
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
      const id = randomUUID();
      let audioUri: string | undefined;
      let recognizer: Awaited<ReturnType<typeof openSenseVoiceRecognizer>> | undefined;
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
        await recognizer?.release();
        if (audioUri) {
          try {
            // The legacy delete API checks `<file>/..`, which fails for iOS temporary files.
            const audio = new File(audioUri);
            if (audio.exists) audio.delete();
          } catch {
            logger.warn('Temporary voice audio cleanup failed');
          }
        }
      }
      try {
        signal.throwIfAborted();
        recognizer = await openSenseVoiceRecognizer(model, signal);
        signal.throwIfAborted();
        await native.start(id);
        signal.throwIfAborted();
      } catch (error) {
        await cleanup();
        signal.throwIfAborted();
        if (error instanceof VoiceError) throw error;
        throw new VoiceError('failed', 'Offline dictation could not start.', { cause: error });
      }
      const activeRecognizer = recognizer;
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
          const text = await activeRecognizer.recognize(captured.uri);
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
