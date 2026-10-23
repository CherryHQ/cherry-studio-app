import * as Speech from 'expo-speech';

import { VoiceError } from '@/shared/contracts/voice';

import type { SpeechEngine } from './engines';
import { splitSpeechText } from './speechText';

const primaryLanguage = (tag: string) => tag.split(/[-_]/, 1)[0]!.toLowerCase();

/** The platform text-to-speech engine through expo-speech; offline and free of charge. */
export function createSystemSpeechEngine({
  voice,
}: {
  /** Empty uses the system default voice for the language. */
  voice(): Promise<string>;
}): SpeechEngine {
  function utter(text: string, language: string, voiceId: string, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const stop = () => void Speech.stop();
      signal.addEventListener('abort', stop, { once: true });
      const settle = (error?: unknown) => {
        signal.removeEventListener('abort', stop);
        if (signal.aborted) reject(signal.reason);
        else if (error) reject(new VoiceError('failed', 'System speech failed.', { cause: error }));
        else resolve();
      };
      Speech.speak(text, {
        language,
        ...(voiceId ? { voice: voiceId } : {}),
        onDone: () => settle(),
        // A stop that reading did not request, such as an audio interruption, fails it.
        onStopped: () => settle(new Error('System speech was stopped.')),
        onError: (error) => settle(error),
      });
    });
  }

  return {
    // Every supported iOS and Android device ships a speech engine.
    status: async () => 'ready',
    async listVoices(language) {
      const primary = primaryLanguage(language);
      const identifiers = new Set<string>();
      return (await Speech.getAvailableVoicesAsync())
        .filter((item) => {
          if (primaryLanguage(item.language) !== primary || identifiers.has(item.identifier))
            return false;
          // Some Android engines return one identifier multiple times. The native speak API
          // selects by identifier alone, so these are not independently selectable voices.
          identifiers.add(item.identifier);
          return true;
        })
        .map((item) => ({ id: item.identifier, name: item.name, language: item.language }));
    },
    async speak({ text, language, signal }) {
      const voiceId = await voice();
      for (const chunk of splitSpeechText(text, Speech.maxSpeechInputLength)) {
        signal.throwIfAborted();
        await utter(chunk, language, voiceId, signal);
      }
    },
  };
}
