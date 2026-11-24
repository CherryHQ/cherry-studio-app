import { createAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { createHttpClient } from '@/backend/services/http';
import {
  isDeepseekConfigured,
  resolveDeepseekConnection,
} from '@/backend/services/providers/deepseekConnection';
import { VoiceError } from '@/shared/contracts/voice';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { voiceAudioSession } from './audioSession';
import type { SpeechEngine } from './engines';
import { splitSpeechText } from './speechText';

const logger = loggerService.withContext('DeepseekSpeech');

async function play(uri: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const player = createAudioPlayer(uri);
  let stop: (() => void) | undefined;
  let subscription: { remove(): void } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isReleased = false;

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
          else player.pause();
        } catch (error) {
          logger.warn('Cancelled speech playback could not be stopped', { error });
        }
      };
      timer = setTimeout(
        () => settle(new VoiceError('failed', 'Speech playback did not finish.')),
        10 * 60_000,
      );
      subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) settle();
        else if (
          status.error ||
          (playing && status.isLoaded && !status.playing && !status.isBuffering)
        )
          settle(new VoiceError('failed', 'Speech playback was interrupted.'));
        playing ||= status.playing;
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
    async speak({ text, signal, backgroundPlayback }) {
      const voiceId = await voice();
      if (voiceId !== 'stella' && voiceId !== 'tide')
        throw new VoiceError('invalid-voice', 'The selected DeepSeek voice is unavailable.');
      const connection = await resolveDeepseekConnection(signal);
      const api = createHttpClient({ baseUrl: connection.baseUrl, timeoutMs: 180_000 });
      const release = await voiceAudioSession.acquire('speech');
      try {
        await voiceAudioSession.playback(backgroundPlayback);
        for (const chunk of splitSpeechText(text, 400)) {
          signal.throwIfAborted();
          const response = await api.request<ArrayBuffer>({
            method: 'POST',
            path: '/v1/tools/tts',
            body: { text: chunk, voice_id: voiceId, format: 'wav', filter_markdown: false },
            headers: connection.headers,
            responseType: 'arraybuffer',
            maxResponseBytes: 16 * 1024 * 1024,
            redirect: 'error',
            signal,
          });
          signal.throwIfAborted();
          const bytes = new Uint8Array(response.data);
          if (
            !response.headers['content-type']?.startsWith('audio/wav') ||
            bytes.length < 44 ||
            String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' ||
            String.fromCharCode(...bytes.subarray(8, 12)) !== 'WAVE'
          )
            throw new VoiceError('failed', 'DeepSeek returned invalid speech audio.');
          const file = new File(
            Paths.cache,
            `deepseek-speech-${globalThis.crypto.randomUUID()}.wav`,
          );
          try {
            file.writeSync(bytes);
            await play(file.uri, signal);
          } finally {
            try {
              if (file.exists) file.delete();
            } catch {
              logger.warn('Temporary speech audio cleanup failed');
            }
          }
        }
      } finally {
        await release();
      }
    },
  };
}
