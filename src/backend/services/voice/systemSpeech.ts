import * as Speech from 'expo-speech';

import { VoiceError } from '@/shared/contracts/voice';
import type { AppLanguage } from '@/shared/utils/languages';

import { voiceAudioSession } from './audioSession';
import type { SpeechEngine } from './engines';
import { splitSpeechText } from './speechText';

const primaryLanguage = (tag: string) => tag.split(/[-_]/, 1)[0]!.toLowerCase();
const languageTag = (tag: string) => tag.replaceAll('_', '-').toLowerCase();

/** The platform text-to-speech engine through expo-speech. */
export function createSystemSpeechEngine({
  voice,
}: {
  /** Empty selects an installed voice for the app language, preferring an exact locale match. */
  voice(): Promise<string>;
}): SpeechEngine {
  function utter(text: string, language: string, voiceId: string, signal: AbortSignal) {
    signal.throwIfAborted();
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (error?: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', stop);
        if (signal.aborted) reject(signal.reason);
        else if (error) reject(new VoiceError('failed', 'System speech failed.', { cause: error }));
        else resolve();
      };
      const stop = () => {
        // A rejected native start may never emit onStopped. The stop acknowledgement must
        // still release the reading so cancellation and application disposal cannot hang.
        try {
          void Speech.stop().then(() => settle(), settle);
        } catch (error) {
          settle(error);
        }
      };
      signal.addEventListener('abort', stop, { once: true });
      try {
        Speech.speak(text, {
          language,
          voice: voiceId,
          onDone: () => settle(),
          // A stop that reading did not request, such as an audio interruption, fails it.
          onStopped: () => settle(new Error('System speech was stopped.')),
          onError: (error) => settle(error),
        });
      } catch (error) {
        settle(error);
      }
    });
  }

  async function listVoices(language: AppLanguage, signal: AbortSignal) {
    signal.throwIfAborted();
    const voices = await Speech.getAvailableVoicesAsync();
    signal.throwIfAborted();
    const primary = primaryLanguage(language);
    const identifiers = new Set<string>();
    return voices
      .filter((item) => {
        if (primaryLanguage(item.language) !== primary || identifiers.has(item.identifier))
          return false;
        // Native speech selects by identifier alone; some engines list the same ID twice.
        identifiers.add(item.identifier);
        return true;
      })
      .map((item) => ({ id: item.identifier, name: item.name, language: item.language }));
  }

  return {
    // Every supported iOS and Android device ships a speech engine.
    status: async () => 'ready',
    listVoices,
    async speak({ text, language, signal }) {
      const [voiceId, voices] = await Promise.all([voice(), listVoices(language, signal)]);
      signal.throwIfAborted();
      // Resolve an installed ID even for the default. expo-speech 58's Android adapter parses
      // a full BCP 47 tag as a language code and otherwise falls back to the device language.
      const selected = voiceId
        ? voices.find((item) => item.id === voiceId)
        : (voices.find((item) => languageTag(item.language) === languageTag(language)) ??
          voices[0]);
      if (!selected) {
        throw new VoiceError(
          voiceId ? 'invalid-voice' : 'unsupported',
          'No installed speaking voice matches the selection and app language.',
        );
      }
      await voiceAudioSession.playback();
      for (const chunk of splitSpeechText(text, Speech.maxSpeechInputLength)) {
        signal.throwIfAborted();
        await utter(chunk, language, selected.id, signal);
      }
    },
  };
}
