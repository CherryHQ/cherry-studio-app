import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

import { VoiceError, type VoiceModelSelection } from '@/shared/contracts/voice';

import type { SpeechEngine } from './engines';
import { splitSpeechText } from './speechText';
import { deleteFile, type VoiceScratch } from './voiceStorage';

/** OpenAI's per-request input limit. */
const MAX_REQUEST_CHARACTERS = 4096;

/** OpenAI's speech voices; a compatible gateway rejects the ones it lacks. */
export const AI_SPEECH_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'cedar',
  'coral',
  'echo',
  'fable',
  'marin',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
] as const;

export type AiSpeechDependencies = {
  ai: {
    generateSpeech(
      input: VoiceModelSelection & { text: string; voice: string },
      signal: AbortSignal,
    ): Promise<{ audio: Uint8Array }>;
  };
  preference: {
    get(key: 'feature.voice.speech_model'): Promise<VoiceModelSelection | null>;
    get(key: 'feature.voice.ai_voice'): Promise<string>;
  };
  scratch: VoiceScratch;
};

const END_TOLERANCE_SECONDS = 0.5;

function play(uri: string, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const player = createAudioPlayer(uri);
    const settle = (error?: unknown) => {
      subscription.remove();
      signal.removeEventListener('abort', abort);
      player.release();
      if (error === undefined) resolve();
      else reject(error);
    };
    const abort = () => {
      player.pause();
      settle(signal.reason);
    };
    let started = false;
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) return settle();
      if (status.error) return settle(new VoiceError('failed', status.error));
      if (status.playing) started = true;
      // Only reading's own stop pauses it; a system pause before the end (a call, unplugged
      // headphones) fails the reading. Near the end, pausing is how the item finishes.
      else if (
        started &&
        !status.isBuffering &&
        status.currentTime < status.duration - END_TOLERANCE_SECONDS
      )
        settle(new VoiceError('failed', 'Playback was interrupted.'));
    });
    signal.addEventListener('abort', abort, { once: true });
    player.play();
  });
}

/**
 * Generates WAV with the configured speech model. Long text is split into requests; the next
 * part is generated while the current one plays.
 */
export function createAiSpeechEngine({
  ai,
  preference,
  scratch,
}: AiSpeechDependencies): SpeechEngine {
  const configuredModel = async () => {
    const model = await preference.get('feature.voice.speech_model');
    return model?.providerId && model.modelId.trim() ? model : null;
  };
  return {
    async status() {
      return (await configuredModel()) ? 'ready' : 'needs-setup';
    },
    async listVoices() {
      return AI_SPEECH_VOICES.map((id) => ({ id, name: id }));
    },
    async speak({ text, signal }) {
      const [model, voice] = await Promise.all([
        configuredModel(),
        preference.get('feature.voice.ai_voice'),
      ]);
      if (!model) throw new VoiceError('not-configured', 'No speech model is configured.');
      const generate = async (chunk: string) => {
        const { audio } = await ai.generateSpeech({ ...model, text: chunk, voice }, signal);
        if (!audio.length) throw new VoiceError('failed', 'The speech model returned no audio.');
        const file = scratch.writeAudio(audio, 'wav');
        if (signal.aborted) {
          deleteFile(file.uri);
          signal.throwIfAborted();
        }
        return file.uri;
      };
      const chunks = splitSpeechText(text, MAX_REQUEST_CHARACTERS);
      let next = chunks.length ? generate(chunks[0]!) : undefined;
      try {
        for (let index = 0; next; index += 1) {
          const uri = await next;
          next = index + 1 < chunks.length ? generate(chunks[index + 1]!) : undefined;
          try {
            await setAudioModeAsync({
              allowsRecording: false,
              playsInSilentMode: true,
              shouldPlayInBackground: false,
            });
            await play(uri, signal);
          } finally {
            deleteFile(uri);
          }
        }
      } finally {
        // A part generated ahead of a stop is never played.
        void next?.then(deleteFile, () => undefined);
      }
    },
  };
}
