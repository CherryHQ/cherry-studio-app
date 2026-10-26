import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

import {
  VoiceError,
  type SpeechModelOptions,
  type VoiceEngineStatus,
  type VoiceModelSelection,
} from '@/shared/contracts/voice';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { generatedAudioExtension } from '@/shared/utils/audioFileTypes';

import type { SpeechEngine } from './engines';
import { splitSpeechText } from './speechText';
import { deleteFile, type VoiceScratch } from './voiceStorage';

const SPEECH_PREFERENCES = ['feature.voice.speech_model', 'feature.voice.ai_voice'] as const;

export type AiSpeechDependencies = {
  ai: {
    getVoiceModelStatus(
      model: VoiceModelSelection,
      operation: 'speech',
      signal: AbortSignal,
    ): Promise<VoiceEngineStatus>;
    getSpeechModelOptions(
      model: VoiceModelSelection,
      signal: AbortSignal,
    ): Promise<SpeechModelOptions>;
    resolveSpeechConfiguration(
      input: VoiceModelSelection & { voice?: string },
      signal: AbortSignal,
    ): Promise<{
      voice: string;
      maxInputCharacters: number;
      mediaType: string;
    }>;
    generateSpeech(
      input: VoiceModelSelection & { text: string; voice: string },
      signal: AbortSignal,
    ): Promise<{ audio: Uint8Array; mediaType: string }>;
  };
  preference: {
    getMultipleRaw(keys: typeof SPEECH_PREFERENCES): Promise<{
      'feature.voice.speech_model': VoiceModelSelection | null;
      'feature.voice.ai_voice': string;
    }>;
  };
  scratch: VoiceScratch;
};

const END_TOLERANCE_SECONDS = 0.5;

function play(uri: string, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const player = createAudioPlayer(uri);
    let settled = false;
    const settle = (error?: unknown) => {
      if (settled) return;
      settled = true;
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
    try {
      player.play();
    } catch (error) {
      settle(error);
    }
  });
}

/**
 * Generates audio with the configured speech model. Long text is split into requests; the next
 * part is generated while the current one plays.
 */
export function createAiSpeechEngine({
  ai,
  preference,
  scratch,
}: AiSpeechDependencies): SpeechEngine {
  const readConfiguration = () => preference.getMultipleRaw(SPEECH_PREFERENCES);
  return {
    async status(signal) {
      const model = (await readConfiguration())['feature.voice.speech_model'];
      return model ? ai.getVoiceModelStatus(model, 'speech', signal) : 'needs-setup';
    },
    async listVoices(_language, signal) {
      const model = (await readConfiguration())['feature.voice.speech_model'];
      return model ? (await ai.getSpeechModelOptions(model, signal)).voices : [];
    },
    async speak({ text, signal }) {
      const snapshot = await readConfiguration();
      const model = snapshot['feature.voice.speech_model'];
      if (!model) throw new VoiceError('not-configured', 'No speech model is configured.');
      const configuration = await ai.resolveSpeechConfiguration(
        { ...model, voice: snapshot['feature.voice.ai_voice'] },
        signal,
      );
      signal.throwIfAborted();
      const generate = async (chunk: string) => {
        const { audio, mediaType } = await ai.generateSpeech(
          { ...model, text: chunk, voice: configuration.voice },
          signal,
        );
        if (!audio.length) throw new VoiceError('failed', 'The speech model returned no audio.');
        const extension = generatedAudioExtension(mediaType);
        if (mediaType !== configuration.mediaType || !extension)
          throw new VoiceError('failed', 'The speech model returned an unsupported audio format.');
        const file = scratch.writeAudio(audio, extension);
        if (signal.aborted) {
          deleteFile(file.uri);
          signal.throwIfAborted();
        }
        return file.uri;
      };
      // A prefetched request can fail while the preceding part is still playing. Observe its
      // rejection immediately, then surface the failure when that part is consumed.
      const prepare = (chunk: string) =>
        generate(chunk).then(
          (uri) => ({ uri }),
          (error: unknown) => ({ error }),
        );
      const chunks = splitSpeechText(text, configuration.maxInputCharacters);
      let next = chunks.length ? prepare(chunks[0]!) : undefined;
      try {
        for (let index = 0; next; index += 1) {
          const part = await next;
          if ('error' in part) throw part.error;
          const { uri } = part;
          next = index + 1 < chunks.length ? prepare(chunks[index + 1]!) : undefined;
          try {
            await setAudioModeAsync({
              allowsRecording: false,
              playsInSilentMode: true,
              shouldPlayInBackground: false,
            });
            await play(uri, signal);
          } catch (error) {
            signal.throwIfAborted();
            loggerService
              .withContext('VoiceSpeech')
              .error('Speech playback failed', { code: 'playback-failed' });
            throw new VoiceError('playback-failed', 'The generated audio could not be played.', {
              cause: error,
            });
          } finally {
            deleteFile(uri);
          }
        }
      } finally {
        // A part generated ahead of a stop is never played.
        void next?.then((part) => {
          if ('uri' in part) deleteFile(part.uri);
        });
      }
    },
  };
}
