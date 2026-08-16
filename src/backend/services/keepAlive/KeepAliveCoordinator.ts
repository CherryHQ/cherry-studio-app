import type { AudioPlayer, AudioStatus } from 'expo-audio';
import { type AppStateStatus, Platform } from 'react-native';

import {
  AppStatePolicy,
  BaseService,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { loggerService } from '@/shared/core/logger/LoggerService';

const KEEP_ALIVE_VOLUME = 0.001;
const AUDIO_STATUS_UPDATE_INTERVAL_MS = 1000;
const KEEP_ALIVE_RETRY_BASE_MS = 1_000;
const KEEP_ALIVE_RETRY_MAX_MS = 30_000;
const logger = loggerService.withContext('KeepAlive');

export type KeepAliveLease = {
  /** Idempotent; the last release across all holders stops the session. */
  release(): void;
};

export type KeepAliveSource = {
  acquire(tag: string): KeepAliveLease;
};

/**
 * Reference-counted background-execution keep-alive. While at least one lease
 * is held, a silent looping audio session keeps Hermes scheduled after the app
 * is backgrounded (the OpenMinis approach). The coordinator is a pure counting
 * primitive: it carries no preference gate — each consumer decides for itself
 * when staying alive is warranted. No-ops off iOS.
 */
@Injectable('KeepAliveCoordinator')
@ServicePhase(Phase.PostReady)
@AppStatePolicy('background-presentation')
export class KeepAliveCoordinator extends BaseService {
  private disposed = false;
  private holderCount = 0;
  private operationTail: Promise<void> = Promise.resolve();
  private player?: AudioPlayer;
  private playerStatusSubscription?: { remove: () => void };
  private retryDelayMs = KEEP_ALIVE_RETRY_BASE_MS;
  private retryTimer?: ReturnType<typeof setTimeout>;

  protected onInit(): void {
    if (Platform.OS !== 'ios') return;
    // A failed session start (audio hardware busy) must retry once the app is
    // actually backgrounded, or a held lease would silently protect nothing.
    this.registerAppStateListener(this.handleAppStateChange);
  }

  acquire(tag: string): KeepAliveLease {
    if (Platform.OS !== 'ios' || this.disposed) return noOpLease;

    let released = false;
    this.holderCount += 1;
    logger.info('Keep-alive lease acquired', { holderCount: this.holderCount, tag });
    void this.enqueue(() => this.reconcile());

    return {
      release: () => {
        if (released || this.disposed) return;
        released = true;
        this.holderCount -= 1;
        logger.info('Keep-alive lease released', { holderCount: this.holderCount, tag });
        void this.enqueue(() => this.reconcile());
      },
    };
  }

  protected async onStop(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.holderCount = 0;
    this.clearRetryTimer();
    await this.enqueue(() => this.stopAudio());
  }

  private readonly handleAppStateChange = (nextState: AppStateStatus) => {
    if (this.disposed || nextState === 'active') return;
    this.clearRetryTimer();
    this.retryDelayMs = KEEP_ALIVE_RETRY_BASE_MS;
    void this.enqueue(() => this.reconcile());
  };

  private async reconcile(): Promise<void> {
    if (this.holderCount === 0 || this.disposed) {
      this.clearRetryTimer();
      this.retryDelayMs = KEEP_ALIVE_RETRY_BASE_MS;
      await this.stopAudio();
      return;
    }
    if (this.player) {
      this.clearRetryTimer();
      this.retryDelayMs = KEEP_ALIVE_RETRY_BASE_MS;
      return;
    }

    let player: AudioPlayer | undefined;
    try {
      // `expo-audio` initializes native classes at module evaluation time.
      // Resolve it only when an iOS lease actually needs audio so the service
      // registry remains importable in non-native runtimes and tests.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native-module load
      const expoAudio = require('expo-audio') as typeof import('expo-audio');
      const { createAudioPlayer, setAudioModeAsync } = expoAudio;
      await setAudioModeAsync({
        allowsRecording: false,
        interruptionMode: 'mixWithOthers',
        playsInSilentMode: true,
        shouldPlayInBackground: true,
      });
      const activePlayer = createAudioPlayer(require('../../../../assets/audio/silence.m4a'), {
        updateInterval: AUDIO_STATUS_UPDATE_INTERVAL_MS,
      });
      player = activePlayer;
      activePlayer.loop = true;
      activePlayer.volume = KEEP_ALIVE_VOLUME;
      activePlayer.play();
      this.player = activePlayer;
      this.playerStatusSubscription = activePlayer.addListener(
        'playbackStatusUpdate',
        (status: AudioStatus) => this.handlePlayerStatusUpdate(activePlayer, status),
      );
      this.clearRetryTimer();
      this.retryDelayMs = KEEP_ALIVE_RETRY_BASE_MS;
      logger.info('Background audio started', { holderCount: this.holderCount });
    } catch (error) {
      if (player) this.releasePlayer(player);
      logger.error('Background audio failed to start', error as Error, {
        holderCount: this.holderCount,
      });
      this.scheduleRetry();
    }
  }

  private async stopAudio(): Promise<void> {
    const player = this.player;
    if (!player) return;
    this.player = undefined;
    const subscription = this.playerStatusSubscription;
    this.playerStatusSubscription = undefined;

    try {
      subscription?.remove();
    } catch (error) {
      logger.error('Background audio status listener cleanup failed', error as Error);
    }
    try {
      player.pause();
    } catch (error) {
      logger.error('Background audio pause failed', error as Error);
    }
    try {
      player.remove();
      logger.info('Background audio stopped');
    } catch (error) {
      logger.error('Background audio removal failed', error as Error);
    }
  }

  private handlePlayerStatusUpdate(player: AudioPlayer, status: AudioStatus): void {
    if (
      this.player !== player ||
      status.playing ||
      status.isBuffering ||
      !status.isLoaded ||
      this.holderCount === 0 ||
      this.disposed
    ) {
      return;
    }

    try {
      player.play();
      logger.info('Background audio resumed after interruption');
    } catch (error) {
      logger.error('Background audio failed to resume after interruption', error as Error);
    }
  }

  private releasePlayer(player: AudioPlayer): void {
    if (this.player === player) this.player = undefined;
    const subscription = this.playerStatusSubscription;
    this.playerStatusSubscription = undefined;
    try {
      subscription?.remove();
    } catch (error) {
      logger.error('Background audio status listener cleanup failed', error as Error);
    }
    try {
      player.remove();
    } catch (error) {
      logger.error('Background audio removal failed after start error', error as Error);
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.holderCount === 0 || this.disposed || this.player) return;
    const delayMs = this.retryDelayMs;
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, KEEP_ALIVE_RETRY_MAX_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.enqueue(() => this.reconcile());
    }, delayMs);
    logger.warn('Scheduling background audio retry', { delayMs, holderCount: this.holderCount });
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const run = this.operationTail.then(operation, operation);
    this.operationTail = run.catch(() => {});
    return run;
  }
}

const noOpLease: KeepAliveLease = { release: () => {} };
