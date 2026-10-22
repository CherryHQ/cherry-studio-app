import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';

import { VoiceError, type DictationSession } from '@/shared/contracts/voice';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { appendUtterance } from '@/shared/utils/dictationText';

import type { DictationEngine } from './engines';
import { requireAccess, type SystemPromptQueue } from './microphoneAccess';

const logger = loggerService.withContext('SystemDictation');

/**
 * Android support currently targets Google's recognizers. Vendor recognizers such as Xiaomi's
 * implement the same `RecognitionService` but are not yet verified on devices, so a device without
 * a Google one has no system engine. The config plugin declares these packages for visibility.
 */
export const GOOGLE_RECOGNITION_SERVICES = [
  'com.google.android.googlequicksearchbox',
  'com.google.android.as',
  'com.google.android.tts',
] as const;

const ERRORS: Partial<Record<ExpoSpeechRecognitionErrorCode, VoiceError['code']>> = {
  'no-speech': 'no-speech',
  'speech-timeout': 'no-speech',
  'not-allowed': 'permission-denied',
  'language-not-supported': 'unsupported',
  'service-not-allowed': 'unsupported',
  busy: 'busy',
};

/** Level events range from -2 to 10, where values below 0 are inaudible. */
const toLevel = (value: number) => Math.min(1, Math.max(0, value / 10));

/** iOS Speech framework or Android SpeechRecognizer through expo-speech-recognition. */
export function createSystemDictationEngine({
  platform,
  permissions,
}: {
  platform: 'ios' | 'android';
  permissions: SystemPromptQueue;
}): DictationEngine {
  const recognitionService = () =>
    platform === 'android'
      ? GOOGLE_RECOGNITION_SERVICES.find((name) =>
          ExpoSpeechRecognitionModule.getSpeechRecognitionServices().includes(name),
        )
      : undefined;

  return {
    async status() {
      try {
        if (platform === 'android' && !recognitionService()) return 'unsupported';
        return ExpoSpeechRecognitionModule.isRecognitionAvailable() ? 'ready' : 'unsupported';
      } catch (error) {
        logger.warn('Could not query speech recognition', { error });
        return 'unsupported';
      }
    },

    async start({ language, signal, onText, onLevel }) {
      await requireAccess(
        permissions,
        {
          get: () => ExpoSpeechRecognitionModule.getPermissionsAsync(),
          request: () => ExpoSpeechRecognitionModule.requestPermissionsAsync(),
        },
        signal,
      );
      signal.throwIfAborted();

      let committed = '';
      let partial = '';
      const text = () => appendUtterance(committed, partial);
      let settle!: (outcome: { text: string } | { error: unknown }) => void;
      const result = new Promise<string>((resolve, reject) => {
        settle = (outcome) => {
          subscriptions.forEach((subscription) => subscription.remove());
          signal.removeEventListener('abort', abort);
          if ('text' in outcome) resolve(outcome.text);
          else reject(outcome.error);
        };
      });
      let started!: (error?: unknown) => void;
      const ready = new Promise<void>((resolve, reject) => {
        started = (error) => (error ? reject(error) : resolve());
      });
      const abort = () => {
        ExpoSpeechRecognitionModule.abort();
        started(signal.reason);
        settle({ error: signal.reason });
      };
      const subscriptions = [
        ExpoSpeechRecognitionModule.addListener('start', () => started()),
        ExpoSpeechRecognitionModule.addListener('result', (event) => {
          const transcript = event.results[0]?.transcript ?? '';
          if (event.isFinal) {
            committed = appendUtterance(committed, transcript);
            partial = '';
          } else {
            partial = transcript;
          }
          onText(text());
        }),
        ExpoSpeechRecognitionModule.addListener('volumechange', (event) =>
          onLevel(toLevel(event.value)),
        ),
        ExpoSpeechRecognitionModule.addListener('error', (event) => {
          if (event.error === 'aborted') return;
          logger.warn('Speech recognition failed', { error: event.error, message: event.message });
          const code = ERRORS[event.error] ?? 'failed';
          // A silence timeout after speech still ends with what was said.
          if (code === 'no-speech' && text()) return;
          const error = new VoiceError(code, event.message);
          started(error);
          settle({ error });
        }),
        ExpoSpeechRecognitionModule.addListener('end', () => {
          const final = text();
          started(new VoiceError('failed', 'Recognition ended before it started.'));
          settle(
            final
              ? { text: final }
              : { error: new VoiceError('no-speech', 'No speech was recognized.') },
          );
        }),
      ];
      signal.addEventListener('abort', abort, { once: true });
      void result.catch(() => undefined);

      try {
        const service = recognitionService();
        ExpoSpeechRecognitionModule.start({
          lang: language,
          interimResults: true,
          continuous: true,
          addsPunctuation: true,
          iosTaskHint: 'dictation',
          volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
          ...(service ? { androidRecognitionServicePackage: service } : {}),
        });
      } catch (error) {
        settle({ error });
        throw error;
      }
      await ready;
      const session: DictationSession = {
        result,
        stop: () => ExpoSpeechRecognitionModule.stop(),
      };
      return session;
    },
  };
}
