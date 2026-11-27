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
import type { SpeechEngine, SpeechPlaybackControls } from './engines';
import { createSpeechPauseGate } from './speechPauseGate';
import { splitSpeechText } from './speechText';

const logger = loggerService.withContext('DeepseekSpeech');

async function play(
  uri: string,
  signal: AbortSignal,
  registerPlayerControls: (controls: SpeechPlaybackControls | null) => void,
  startPaused: boolean,
  onPlaybackStart?: () => void,
  onInterrupted?: () => void,
): Promise<void> {
  signal.throwIfAborted();
  let activePlayer: ReturnType<typeof createAudioPlayer> | null = null;
  let stop: (() => void) | undefined;
  let subscription: { remove(): void } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isReleased = false;
  let state: 'starting' | 'playing' | 'paused' = startPaused ? 'paused' : 'starting';
  let resumePosition = 0;
  let seekToken = 0;

  function pausePlayer() {
    try {
      activePlayer?.pause();
    } catch (error) {
      logger.warn('Speech playback could not be paused', { error });
    }
  }

  function detachPlayer(capturePosition: boolean) {
    const player = activePlayer;
    if (!player) return false;
    let finished = false;
    if (capturePosition) {
      const currentTime = (player as { currentTime?: unknown }).currentTime;
      if (typeof currentTime === 'number' && Number.isFinite(currentTime) && currentTime > 0) {
        resumePosition = currentTime;
      }
    }
    if (Platform.OS === 'ios') {
      // Muting and stripping the AVPlayerItem before release prevents a concurrent expo-audio
      // sessionQueue interruption-resume snapshot from playing audio on the released player.
      try {
        player.muted = true;
        player.volume = 0;
        (player as { replace?: (source: null) => void }).replace?.(null);
      } catch {
        // Ignore best-effort teardown hardening if the native player is already released.
      }
    } else if (capturePosition) {
      try {
        player.muted = true;
        player.volume = 0;
        // Clear expo-audio's focus-resume intent before its asynchronous release.
        player.pause();
        // An end event queued before pause can be lost when we remove the listener.
        finished = player.currentStatus.playbackState === 'ended';
      } catch {
        // Ignore best-effort teardown hardening if the native player is already released.
      }
    }
    activePlayer = null;
    const sub = subscription;
    subscription = undefined;
    try {
      sub?.remove();
    } finally {
      player.release();
    }
    return finished;
  }

  function releasePlayer() {
    if (isReleased) return;
    isReleased = true;
    seekToken += 1;
    registerPlayerControls(null);
    clearTimeout(timer);
    timer = undefined;
    if (stop) signal.removeEventListener('abort', stop);
    detachPlayer(false);
  }

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (error?: unknown) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve();
      };
      const armTimer = () => {
        clearTimeout(timer);
        timer = setTimeout(
          () => settle(new VoiceError('failed', 'Speech playback did not finish.')),
          10 * 60_000,
        );
      };
      const attachAndPlay = (seekToPosition: number) => {
        if (settled || isReleased) return;
        const token = ++seekToken;
        const player = createAudioPlayer(uri);
        activePlayer = player;
        subscription = player.addListener('playbackStatusUpdate', (status) => {
          if (settled || signal.aborted || activePlayer !== player) return;
          const statusCurrentTime = (status as { currentTime?: unknown }).currentTime;
          if (
            typeof statusCurrentTime === 'number' &&
            Number.isFinite(statusCurrentTime) &&
            statusCurrentTime > 0
          ) {
            resumePosition = statusCurrentTime;
          }
          if (status.didJustFinish) {
            if (state === 'starting') {
              state = 'playing';
              onPlaybackStart?.();
            }
            settle();
            return;
          }
          if (status.error) {
            settle(new VoiceError('failed', 'Speech playback was interrupted.'));
            return;
          }
          if (status.playing) {
            if (state === 'starting') {
              state = 'playing';
              onPlaybackStart?.();
            } else if (state === 'paused') {
              // Queued playback updates emitted before pause must not override paused intent.
              try {
                player.pause();
              } catch {
                // Ignore best-effort re-pause if player is already stopping or released.
              }
            }
            return;
          }
          if (state === 'playing' && status.isLoaded && !status.isBuffering) {
            if (onInterrupted) {
              onInterrupted();
            } else {
              settle(new VoiceError('failed', 'Speech playback was interrupted.'));
            }
          }
        });

        const startPlayback = () => {
          if (
            settled ||
            isReleased ||
            activePlayer !== player ||
            seekToken !== token ||
            state !== 'starting'
          ) {
            return;
          }
          try {
            player.play();
          } catch (error) {
            settle(error);
          }
        };

        const seek = (player as { seekTo?: (seconds: number) => Promise<void> }).seekTo;
        if (seekToPosition > 0 && typeof seek === 'function') {
          void Promise.resolve(seek.call(player, seekToPosition))
            .catch(() => {})
            .then(startPlayback);
          return;
        }
        startPlayback();
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
      registerPlayerControls({
        pause() {
          if (settled || isReleased || state === 'paused') return;
          state = 'paused';
          seekToken += 1;
          clearTimeout(timer);
          timer = undefined;
          try {
            // Releasing the paused player removes its listener and evicts it from expo-audio's
            // platform interruption registries so delayed events or focus regain cannot resume it.
            if (detachPlayer(true)) settle();
          } catch (error) {
            settle(error);
          }
        },
        resume() {
          if (settled || isReleased || state !== 'paused') return;
          state = 'starting';
          armTimer();
          try {
            attachAndPlay(resumePosition);
          } catch (error) {
            settle(error);
          }
          return 'preparing';
        },
      });
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) stop();
      else if (!settled && state !== 'paused') {
        armTimer();
        try {
          attachAndPlay(0);
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
    async speak({ text, signal, backgroundPlayback, playback }) {
      const chunks = splitSpeechText(text, 400, 140);
      if (chunks.length === 0) return;
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
      const gate = createSpeechPauseGate(signal);
      const prefetchController = new AbortController();
      let needsPlayingPhase = true;
      let playerControls: SpeechPlaybackControls | null = null;
      let prefetched:
        | Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: unknown }>
        | undefined;

      const notifyPlaybackStart = () => {
        if (!needsPlayingPhase || gate.isPaused()) return;
        needsPlayingPhase = false;
        playback?.onPhase('playing');
      };

      const pause = () => {
        if (!gate.pause()) return;
        needsPlayingPhase = false;
        playback?.onPhase('paused');
        playerControls?.pause();
      };
      const resume = () => {
        if (!gate.resume()) return;
        needsPlayingPhase = true;
        playback?.onPhase('preparing');
        playerControls?.resume();
        return 'preparing' as const;
      };

      try {
        signal.throwIfAborted();
        await voiceAudioSession.playback(backgroundPlayback);
        signal.throwIfAborted();
        playback?.onControls({ pause, resume });
        await gate.waitIfPaused();
        signal.throwIfAborted();
        playback?.onProgress({ completedChunks: 0, totalChunks: chunks.length });
        playback?.onPhase('preparing');
        let bytes = await synthesize(chunks[0]!, signal);
        for (let index = 0; index < chunks.length; index += 1) {
          await gate.waitIfPaused();
          signal.throwIfAborted();
          const next = chunks[index + 1];
          if (next !== undefined && !gate.isPaused()) {
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
            await gate.waitIfPaused();
            signal.throwIfAborted();
            await play(
              file.uri,
              signal,
              (controls) => {
                playerControls = controls;
              },
              gate.isPaused(),
              notifyPlaybackStart,
              playback?.onInterrupted,
            );
            playback?.onProgress({ completedChunks: index + 1, totalChunks: chunks.length });
          } finally {
            try {
              if (file.exists) file.delete();
            } catch {
              logger.warn('Temporary speech audio cleanup failed');
            }
          }
          if (index + 1 >= chunks.length) break;
          await gate.waitIfPaused();
          signal.throwIfAborted();
          if (!prefetched) {
            bytes = await synthesize(chunks[index + 1]!, signal);
          } else {
            const result = await raceAbort(prefetched, signal);
            prefetched = undefined;
            signal.throwIfAborted();
            if (!result.ok) throw result.error;
            bytes = result.bytes;
          }
        }
      } finally {
        playerControls = null;
        playback?.onControls(null);
        if (prefetched) {
          prefetchController.abort(signal.reason);
          await prefetched;
        }
        await release();
      }
    },
  };
}
