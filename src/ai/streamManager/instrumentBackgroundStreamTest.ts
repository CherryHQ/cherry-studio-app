import type { UIMessageChunk } from 'ai';
import type { AudioPlayer } from 'expo-audio';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { loggerService } from '@/core/logger/LoggerService';

const logger = loggerService.withContext('BackgroundStreamTest');

const TIMER_INTERVAL_MS = 1000;
const KEEP_ALIVE_VOLUME = 0.001;

type FinalReason = 'cancelled' | 'completed' | 'error';

interface StreamTestContext {
  messageId?: string;
  modelId: string;
}

interface StreamTestMetrics {
  appState: AppStateStatus;
  backgroundChunkCount: number;
  backgroundTimerTickCount: number;
  chunkCount: number;
  lastChunkAt?: number;
  lastTimerTickAt?: number;
  maxChunkGapMs: number;
  maxTimerGapMs: number;
  startedAt: number;
  timerTickCount: number;
}

function isBackgroundStreamTestEnabled(): boolean {
  return (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    process.env.NODE_ENV !== 'test' &&
    Platform.OS === 'ios'
  );
}

function timestamp(): string {
  return new Date().toISOString();
}

function toLogContext(context: StreamTestContext, metrics: StreamTestMetrics) {
  return {
    appState: metrics.appState,
    backgroundChunkCount: metrics.backgroundChunkCount,
    backgroundTimerTickCount: metrics.backgroundTimerTickCount,
    chunkCount: metrics.chunkCount,
    elapsedMs: Date.now() - metrics.startedAt,
    lastChunkAt: metrics.lastChunkAt ? new Date(metrics.lastChunkAt).toISOString() : undefined,
    lastTimerTickAt: metrics.lastTimerTickAt
      ? new Date(metrics.lastTimerTickAt).toISOString()
      : undefined,
    maxChunkGapMs: metrics.maxChunkGapMs,
    maxTimerGapMs: metrics.maxTimerGapMs,
    messageId: context.messageId,
    modelId: context.modelId,
    timestamp: timestamp(),
    timerTickCount: metrics.timerTickCount,
  };
}

async function startSilentPlayback(): Promise<AudioPlayer> {
  const { createAudioPlayer, setAudioModeAsync } =
    require('expo-audio') as typeof import('expo-audio');

  await setAudioModeAsync({
    allowsRecording: false,
    interruptionMode: 'mixWithOthers',
    playsInSilentMode: true,
    shouldPlayInBackground: true,
  });

  const player = createAudioPlayer(require('../../../assets/audio/silence.m4a'), {
    updateInterval: TIMER_INTERVAL_MS,
  });
  player.loop = true;
  player.volume = KEEP_ALIVE_VOLUME;
  player.play();
  return player;
}

/**
 * Stage-0 diagnostic for iOS background streaming. It deliberately runs only
 * in Debug builds and should be removed once the go/no-go result is known.
 */
export function instrumentBackgroundStreamTest(
  stream: ReadableStream<UIMessageChunk>,
  context: StreamTestContext,
): ReadableStream<UIMessageChunk> {
  if (!isBackgroundStreamTestEnabled()) {
    return stream;
  }

  const reader = stream.getReader();
  const metrics: StreamTestMetrics = {
    appState: AppState.currentState,
    backgroundChunkCount: 0,
    backgroundTimerTickCount: 0,
    chunkCount: 0,
    maxChunkGapMs: 0,
    maxTimerGapMs: 0,
    startedAt: Date.now(),
    timerTickCount: 0,
  };

  let appStateSubscription: ReturnType<typeof AppState.addEventListener> | undefined;
  let didFinalize = false;
  let didStart = false;
  let player: AudioPlayer | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const logSummary = (event: string, reason?: FinalReason) => {
    logger.info(event, {
      ...toLogContext(context, metrics),
      reason,
    });
  };

  const removeAppStateSubscriptionWhenActive = () => {
    if (metrics.appState === 'active') {
      appStateSubscription?.remove();
      appStateSubscription = undefined;
    }
  };

  const finalize = (reason: FinalReason, error?: unknown) => {
    if (didFinalize) return;
    didFinalize = true;

    if (timer) clearInterval(timer);
    timer = undefined;

    try {
      player?.pause();
      player?.remove();
    } catch (cleanupError) {
      logger.warn('Silent player cleanup failed', cleanupError as Error, {
        messageId: context.messageId,
      });
    }
    player = undefined;

    if (error instanceof Error) {
      logger.warn('Stream test finished with an error', error, {
        ...toLogContext(context, metrics),
        reason,
      });
    } else {
      logSummary('Stream test finished', reason);
    }

    // Keep the tiny listener until the app returns so a stream that completed
    // in the background still emits one foreground-visible summary.
    removeAppStateSubscriptionWhenActive();
    reader.releaseLock();
  };

  const start = async () => {
    if (didStart) return;
    didStart = true;

    appStateSubscription = AppState.addEventListener('change', (nextState) => {
      metrics.appState = nextState;
      logSummary('App state changed');
      if (nextState === 'active' && didFinalize) {
        removeAppStateSubscriptionWhenActive();
      }
    });

    timer = setInterval(() => {
      const now = Date.now();
      metrics.timerTickCount += 1;
      metrics.maxTimerGapMs = Math.max(
        metrics.maxTimerGapMs,
        metrics.lastTimerTickAt ? now - metrics.lastTimerTickAt : 0,
      );
      metrics.lastTimerTickAt = now;
      if (metrics.appState !== 'active') metrics.backgroundTimerTickCount += 1;
      logger.info('Timer tick', toLogContext(context, metrics));
    }, TIMER_INTERVAL_MS);

    try {
      const startedPlayer = await startSilentPlayback();
      if (didFinalize) {
        startedPlayer.pause();
        startedPlayer.remove();
        return;
      }
      player = startedPlayer;
      logSummary('Stream test started');
    } catch (error) {
      logger.warn(
        'Silent playback failed; continuing telemetry without keep-alive',
        error as Error,
        {
          ...toLogContext(context, metrics),
        },
      );
    }
  };

  return new ReadableStream<UIMessageChunk>({
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        finalize('cancelled');
      }
    },
    async pull(controller) {
      await start();
      if (didFinalize) return;

      try {
        const { done, value } = await reader.read();
        if (done) {
          finalize('completed');
          controller.close();
          return;
        }

        const now = Date.now();
        metrics.chunkCount += 1;
        metrics.maxChunkGapMs = Math.max(
          metrics.maxChunkGapMs,
          metrics.lastChunkAt ? now - metrics.lastChunkAt : 0,
        );
        metrics.lastChunkAt = now;
        if (metrics.appState !== 'active') metrics.backgroundChunkCount += 1;

        logger.info('Stream chunk', {
          ...toLogContext(context, metrics),
          chunkType: value.type,
        });
        controller.enqueue(value);
      } catch (error) {
        finalize('error', error);
        controller.error(error);
      }
    },
  });
}
