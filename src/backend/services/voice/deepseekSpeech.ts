import { createAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { createHttpClient } from '@/backend/services/http';
import {
  isDeepseekConfigured,
  resolveDeepseekConnection,
} from '@/backend/services/providers/deepseekConnection';
import { raceAbort } from '@/backend/utils/raceAbort';
import { VoiceError } from '@/shared/contracts/voice';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { voiceAudioSession } from './audioSession';
import type { SpeechEngine } from './engines';
import { splitSpeechText } from './speechText';

const logger = loggerService.withContext('DeepseekSpeech');

async function play(uri: string, signal: AbortSignal, onPlaybackStart?: () => void): Promise<void> {
  signal.throwIfAborted();
  const player = createAudioPlayer(uri);
  let stop: (() => void) | undefined;
  let subscription: { remove(): void } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isReleased = false;

  function pausePlayer() {
    try {
      player.pause();
    } catch (error) {
      logger.warn('Speech playback could not be paused', { error });
    }
  }

  function releasePlayer() {
    if (isReleased) return;
    isReleased = true;
    clearTimeout(timer);
    if (stop) signal.removeEventListener('abort', stop);
    try {
      subscription?.remove();
    } finally {
      player.release();
    }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let playing = false;
      const settle = (error?: unknown) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve();
      };
      stop = () => {
        settle(signal.reason ?? new Error('Speech was cancelled.'));
        try {
          // iOS pause schedules shared session deactivation. Release stops this player directly.
          if (Platform.OS === 'ios') releasePlayer();
          else pausePlayer();
        } catch (error) {
          logger.warn('Cancelled speech playback could not be stopped', { error });
        }
      };
      timer = setTimeout(
        () => settle(new VoiceError('failed', 'Speech playback did not finish.')),
        10 * 60_000,
      );
      subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (settled || signal.aborted) return;
        if (status.didJustFinish) {
          if (!playing) {
            playing = true;
            onPlaybackStart?.();
          }
          settle();
        } else if (
          status.error ||
          (playing && status.isLoaded && !status.playing && !status.isBuffering)
        )
          settle(new VoiceError('failed', 'Speech playback was interrupted.'));
        else if (!playing && status.playing) {
          playing = true;
          onPlaybackStart?.();
        }
      });
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) stop();
      else if (!settled) {
        try {
          player.play();
        } catch (error) {
          settle(error);
        }
      }
    });
  } catch (error) {
    if (Platform.OS === 'android' && !signal.aborted) pausePlayer();
    throw error;
  } finally {
    releasePlayer();
  }
}

/** Complete answers are synthesized in bounded utterances through the existing voice activity. */
export function createDeepseekSpeech(voice: () => Promise<string>): SpeechEngine {
  return {
    async status(signal) {
      return (await isDeepseekConfigured(signal)) ? 'ready' : 'needs-service';
    },
    async listVoices(_language, signal) {
      signal.throwIfAborted();
      return [
        { id: 'stella', name: 'Stella' },
        { id: 'tide', name: 'Tide' },
      ];
    },
    async speak({ text, signal, backgroundPlayback, onPlaybackStart }) {
      const chunks = splitSpeechText(text, 400, 140);
      if (!chunks.length) return;
      const voiceId = await voice();
      signal.throwIfAborted();
      if (voiceId !== 'stella' && voiceId !== 'tide')
        throw new VoiceError('invalid-voice', 'The selected DeepSeek voice is unavailable.');
      const connection = await resolveDeepseekConnection(signal);
      signal.throwIfAborted();
      const api = createHttpClient({ baseUrl: connection.baseUrl, timeoutMs: 180_000 });

      async function synthesize(chunk: string, requestSignal: AbortSignal): Promise<Uint8Array> {
        requestSignal.throwIfAborted();
        const response = await api.request<ArrayBuffer>({
          method: 'POST',
          path: '/v1/tools/tts',
          body: { text: chunk, voice_id: voiceId, format: 'wav', filter_markdown: false },
          headers: connection.headers,
          responseType: 'arraybuffer',
          maxResponseBytes: 16 * 1024 * 1024,
          redirect: 'error',
          signal: requestSignal,
        });
        requestSignal.throwIfAborted();
        const bytes = new Uint8Array(response.data);
        if (
          !response.headers['content-type']?.startsWith('audio/wav') ||
          bytes.length < 44 ||
          String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' ||
          String.fromCharCode(...bytes.subarray(8, 12)) !== 'WAVE'
        )
          throw new VoiceError('failed', 'DeepSeek returned invalid speech audio.');
        return bytes;
      }

      const release = await voiceAudioSession.acquire('speech');
      const prefetchController = new AbortController();
      let hasStarted = false;
      const notifyPlaybackStart = () => {
        if (hasStarted) return;
        hasStarted = true;
        onPlaybackStart?.();
      };
      let prefetched:
        | Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: unknown }>
        | undefined;
      try {
        signal.throwIfAborted();
        await voiceAudioSession.playback(backgroundPlayback);
        let bytes = await synthesize(chunks[0], signal);
        for (let index = 0; index < chunks.length; index++) {
          signal.throwIfAborted();
          const next = chunks[index + 1];
          if (next !== undefined) {
            // Keep the next WAV in memory. Cancellation drains it after the current player/file.
            prefetched = synthesize(next, prefetchController.signal).then(
              (audio) => ({ ok: true as const, bytes: audio }),
              (error: unknown) => ({ ok: false as const, error }),
            );
          }
          const file = new File(
            Paths.cache,
            `deepseek-speech-${globalThis.crypto.randomUUID()}.wav`,
          );
          try {
            signal.throwIfAborted();
            file.writeSync(bytes);
            await play(file.uri, signal, notifyPlaybackStart);
          } finally {
            try {
              if (file.exists) file.delete();
            } catch {
              logger.warn('Temporary speech audio cleanup failed');
            }
          }
          if (!prefetched) break;
          const result = await raceAbort(prefetched, signal);
          prefetched = undefined;
          signal.throwIfAborted();
          if (!result.ok) throw result.error;
          bytes = result.bytes;
        }
      } finally {
        if (prefetched) {
          prefetchController.abort(signal.reason);
          await prefetched;
        }
        await release();
      }
    },
  };
}
