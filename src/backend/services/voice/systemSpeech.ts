import * as Speech from 'expo-speech';

import { VoiceError } from '@/shared/contracts/voice';
import type { AppLanguage } from '@/shared/utils/languages';

import { voiceAudioSession } from './audioSession';
import type { SpeechEngine } from './engines';
import { createSpeechPauseGate } from './speechPauseGate';
import { splitSpeechText } from './speechText';

const primaryLanguage = (tag: string) => tag.split(/[-_]/, 1)[0]!.toLowerCase();
const languageTag = (tag: string) => tag.replaceAll('_', '-').toLowerCase();
const SYSTEM_SPEECH_MAX_CHUNK_LENGTH = 220;

/** The platform text-to-speech engine through expo-speech. */
export function createSystemSpeechEngine({
  voice,
}: {
  /** Empty selects an installed voice for the app language, preferring an exact locale match. */
  voice(): Promise<string>;
}): SpeechEngine {
  function utter(
    text: string,
    language: string,
    voiceId: string,
    signal: AbortSignal,
    registerPause: (pause: (() => void) | undefined) => void,
    onStart: () => void,
    onInterrupted?: () => void,
    onLateDone?: () => void,
    isUtteranceCurrent: () => boolean = () => true,
  ): Promise<'done' | 'paused'> {
    signal.throwIfAborted();
    return new Promise<'done' | 'paused'>((resolve, reject) => {
      let settled = false;
      let settledOutcome: 'done' | 'paused' | null = null;
      let lateDoneHandled = false;
      let pausing = false;
      let pauseFallbackTimer: ReturnType<typeof setTimeout> | undefined;
      const settle = (outcome: 'done' | 'paused', error?: unknown) => {
        if (settled) return;
        settled = true;
        settledOutcome = outcome;
        clearTimeout(pauseFallbackTimer);
        pauseFallbackTimer = undefined;
        registerPause(undefined);
        signal.removeEventListener('abort', stop);
        if (signal.aborted) reject(signal.reason);
        else if (error) reject(new VoiceError('failed', 'System speech failed.', { cause: error }));
        else resolve(outcome);
      };
      const stop = () => {
        // A rejected native start may never emit onStopped. The stop acknowledgement must
        // still release the reading so cancellation and application disposal cannot hang.
        try {
          void Speech.stop().then(
            () => settle('done'),
            (error) => settle('done', error),
          );
        } catch (error) {
          settle('done', error);
        }
      };
      registerPause(() => {
        if (settled || pausing) return;
        pausing = true;
        try {
          void Speech.stop().then(
            () => {
              if (settled) return;
              // Allow a trailing onDone queued alongside Speech.stop() to advance the chunk.
              pauseFallbackTimer = setTimeout(() => settle('paused'), 50);
            },
            (error) => settle('paused', error),
          );
        } catch (error) {
          settle('paused', error);
        }
      });
      signal.addEventListener('abort', stop, { once: true });
      try {
        Speech.speak(text, {
          language,
          voice: voiceId,
          useApplicationAudioSession: true,
          onStart: () => {
            if (settled || pausing || signal.aborted) return;
            onStart();
          },
          // Even if pause completed or timed out right as native finished, never replay finished prose.
          onDone: () => {
            if (!settled) {
              if (!pausing && !signal.aborted) onStart();
              settle('done');
              return;
            }
            if (
              settledOutcome === 'paused' &&
              !lateDoneHandled &&
              !signal.aborted &&
              isUtteranceCurrent()
            ) {
              lateDoneHandled = true;
              onLateDone?.();
            }
          },
          // Unexpected native stop delegates to runtime interruption handling when wired.
          onStopped: () => {
            lateDoneHandled = true;
            if (pausing) {
              settle('paused');
            } else if (onInterrupted) {
              settle('paused');
              onInterrupted();
            } else {
              settle('done', new Error('System speech was stopped.'));
            }
          },
          onError: (error) => {
            lateDoneHandled = true;
            if (pausing) settle('paused');
            else settle('done', error);
          },
        });
      } catch (error) {
        settle('done', error);
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
    async speak({ text, language, signal, backgroundPlayback, playback }) {
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
      const chunks = splitSpeechText(
        text,
        Math.min(SYSTEM_SPEECH_MAX_CHUNK_LENGTH, Speech.maxSpeechInputLength),
      );
      if (chunks.length === 0) return;

      const release = await voiceAudioSession.acquire('speech');
      const gate = createSpeechPauseGate(signal);
      let activePause: (() => void) | undefined;
      let needsPlayingPhase = true;

      const notifyPlaybackStart = () => {
        if (!needsPlayingPhase || gate.isPaused()) return;
        needsPlayingPhase = false;
        playback?.onPhase('playing');
      };

      const pause = () => {
        if (!gate.pause()) return;
        needsPlayingPhase = false;
        playback?.onPhase('paused');
        activePause?.();
      };
      const resume = () => {
        if (!gate.resume()) return;
        needsPlayingPhase = true;
        playback?.onPhase('preparing');
        return 'preparing' as const;
      };

      try {
        signal.throwIfAborted();
        await voiceAudioSession.playback(backgroundPlayback);
        signal.throwIfAborted();
        playback?.onControls({ pause, resume });
        let index = 0;
        let utteranceToken = 0;
        while (index < chunks.length) {
          await gate.waitIfPaused();
          signal.throwIfAborted();
          if (index >= chunks.length) break;
          playback?.onProgress({ completedChunks: index, totalChunks: chunks.length });
          utteranceToken += 1;
          const currentToken = utteranceToken;
          const expectedIndex = index;
          const outcome = await utter(
            chunks[index]!,
            language,
            selected.id,
            signal,
            (fn) => {
              activePause = fn;
            },
            notifyPlaybackStart,
            playback?.onInterrupted,
            () => {
              if (utteranceToken !== currentToken || index !== expectedIndex) return;
              index += 1;
              playback?.onProgress({ completedChunks: index, totalChunks: chunks.length });
              if (index >= chunks.length) {
                gate.release();
              }
            },
            () => utteranceToken === currentToken,
          );
          if (outcome === 'done') {
            utteranceToken += 1;
            index += 1;
            playback?.onProgress({ completedChunks: index, totalChunks: chunks.length });
          }
        }
      } finally {
        activePause = undefined;
        playback?.onControls(null);
        await release();
      }
    },
  };
}
