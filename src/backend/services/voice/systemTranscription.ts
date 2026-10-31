import { randomUUID } from 'expo-crypto';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Platform } from 'react-native';

import {
  VoiceError,
  type AudioTranscriptionOptions,
  type VoiceEngineStatus,
} from '@/shared/contracts/voice';
import type { AppLanguage } from '@/shared/utils/languages';

import { getVoiceInput } from '../../../../modules/voice-input';
import { requireAccess, type SystemPromptQueue } from './microphoneAccess';
import { transcribeAudioChunks } from './transcribeAudioChunks';

/** File recognition has its own strict on-device path; live system dictation keeps its policy. */
export function createSystemTranscription({
  permissions,
  language,
}: {
  permissions: SystemPromptQueue;
  language(): AppLanguage;
}) {
  async function status(signal: AbortSignal, locale = language()): Promise<VoiceEngineStatus> {
    const native = getVoiceInput();
    if (
      !native?.decodeAudioChunk ||
      !native.systemTranscriptionStatus ||
      !native.transcribeAudioChunk ||
      !native.cancelTranscription
    )
      return 'unsupported';
    try {
      const result = await native.systemTranscriptionStatus(locale);
      signal.throwIfAborted();
      return result;
    } catch {
      signal.throwIfAborted();
      return 'unsupported';
    }
  }
  return {
    status,
    async transcribe(uri: string, options: AudioTranscriptionOptions & { signal: AbortSignal }) {
      const { signal } = options;
      const locale = language();
      const availability = await status(signal, locale);
      if (availability !== 'ready')
        throw new VoiceError(
          availability === 'needs-setup' ? 'offline-recognition-unavailable' : 'unsupported',
          'On-device file recognition is unavailable for the selected language.',
        );
      // Android's SpeechRecognizer requires RECORD_AUDIO even with a supplied file. iOS only
      // requests Speech authorization here; neither platform starts our microphone recorder.
      await requireAccess(
        permissions,
        Platform.OS === 'ios'
          ? {
              get: () => ExpoSpeechRecognitionModule.getSpeechRecognizerPermissionsAsync(),
              request: () => ExpoSpeechRecognitionModule.requestSpeechRecognizerPermissionsAsync(),
            }
          : {
              get: () => ExpoSpeechRecognitionModule.getMicrophonePermissionsAsync(),
              request: () => ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync(),
            },
        signal,
      );
      signal.throwIfAborted();
      const native = getVoiceInput()!;
      return transcribeAudioChunks(
        uri,
        async (chunkUri) => {
          signal.throwIfAborted();
          const id = randomUUID();
          // Enqueue start before attaching cancellation so native queues preserve their order.
          const work = native.transcribeAudioChunk!(id, chunkUri, locale);
          let cancellation: Promise<void> | undefined;
          const abort = () => {
            cancellation ??= native.cancelTranscription!(id).catch(() => undefined);
          };
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
          try {
            const result = await work;
            signal.throwIfAborted();
            if (result.error === 'no-speech') return '';
            if (result.error)
              throw new VoiceError(result.error, 'System audio transcription failed.');
            return result.text?.trim() ?? '';
          } finally {
            signal.removeEventListener('abort', abort);
            await cancellation;
          }
        },
        options,
      );
    },
  };
}
