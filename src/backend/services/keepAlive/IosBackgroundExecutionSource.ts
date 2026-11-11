import { AppState, Platform, type AppStateStatus } from 'react-native';
import { v7 as uuidv7 } from 'uuid';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { BackgroundExecutionStatus } from '@/shared/contracts/backgroundExecution';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  getSystemIntegration,
  type SystemIntegrationNativeModule,
} from '../../../../modules/system-integration';
import type { KeepAliveLease, KeepAliveSource, KeepAliveTask } from './KeepAliveCoordinator';
import { KeepAliveInterruptionError } from './KeepAliveInterruptionError';

type Holder = {
  onInterrupt?: (reason: Error) => void | Promise<void>;
  isInterrupted: boolean;
};

type ContinuedTask = {
  holder: Holder;
  task: KeepAliveTask;
  state: 'starting' | 'active' | 'unavailable' | 'expired';
  submitted: boolean;
  sent?: KeepAliveTask;
  success: boolean;
};

const logger = loggerService.withContext('IosBackgroundExecution');
let nextTaskId = 0;

/** Foreground user tasks prefer continued processing; consented audio is fallback only. */
@Injectable('IosBackgroundExecutionSource')
@ServicePhase(Phase.PostReady)
@DependsOn(['PreferenceService'])
@AppStatePolicy('background-presentation')
export class IosBackgroundExecutionSource extends BaseService implements KeepAliveSource {
  private disposed = false;
  private blocked = false;
  private readonly holders = new Set<Holder>();
  private readonly continuedTasks = new Map<string, ContinuedTask>();
  private readonly listeners = new Set<() => void>();
  private native: SystemIntegrationNativeModule | null = null;
  private taskId?: string;
  private audioId?: string;
  private audioActive = false;
  private audioBlocked = false;
  private audioNeedsRefresh = false;
  private audioRevision = 0;
  private starting = false;
  private operationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly preference: Pick<PreferenceService, 'readCached' | 'subscribeChange'>,
  ) {
    super();
  }

  protected onInit(): void {
    if (Platform.OS !== 'ios') return;
    this.native = getSystemIntegration();
    if (this.native?.beginBackgroundExecution) {
      const subscription = this.native.addListener('onBackgroundExecutionExpired', ({ id }) => {
        if (this.disposed || id !== this.taskId) return;
        this.taskId = undefined;
        this.blocked = true;
        this.publishStatus();
        // An event queued before foreground return must not cancel foreground work.
        if (AppState.currentState !== 'active') this.interruptIfUnprotected();
        else this.handleAppStateChange('active');
        this.enqueueReconcile();
      });
      this.registerDisposable(() => subscription.remove());
    }
    if (this.native?.beginBackgroundAudioExecution) {
      const subscription = this.native.addListener('onBackgroundAudioStateChanged', (event) => {
        if (this.disposed || event.id !== this.audioId) return;
        this.audioRevision += 1;
        this.audioActive = event.active;
        this.interruptIfUnprotected();
        this.publishStatus();
        this.enqueueReconcile();
      });
      this.registerDisposable(() => subscription.remove());
    }
    if (this.native?.beginContinuedProcessingTask) {
      const subscription = this.native.addListener('onContinuedProcessingStateChanged', (event) => {
        const continued = this.continuedTasks.get(event.id);
        if (
          this.disposed ||
          !continued ||
          !this.holders.has(continued.holder) ||
          continued.state === 'unavailable' ||
          continued.state === 'expired'
        )
          return;
        continued.state = event.state;
        if (event.state === 'expired')
          this.interruptHolder(
            continued.holder,
            new KeepAliveInterruptionError('continued-processing-expired'),
          );
        // A failed request can use fallback. A revoked running task cannot.
        this.publishStatus();
        this.enqueueReconcile();
      });
      this.registerDisposable(() => subscription.remove());
    }
    this.registerDisposable(
      this.preference.subscribeChange('app.background_audio.consent')(() => {
        if (!this.disposed) this.enqueueReconcile();
      }),
    );
    this.registerAppStateListener(this.handleAppStateChange);
  }

  getStatus = (): BackgroundExecutionStatus => {
    if (this.holders.size === 0) return 'idle';
    if (this.isUnprotected()) {
      return 'interrupted';
    }
    return this.starting ? 'starting' : 'limited';
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  acquire(_tag: string, onInterrupt?: Holder['onInterrupt'], task?: KeepAliveTask): KeepAliveLease {
    if (this.disposed) return { release: () => {} };
    const holder: Holder = { onInterrupt, isInterrupted: false };
    this.holders.add(holder);
    // Foreground return or restored demand must never manufacture another user action.
    const continued =
      task && AppState.currentState === 'active' && this.native?.beginContinuedProcessingTask
        ? { holder, task, state: 'starting' as const, submitted: false, success: false }
        : undefined;
    if (continued) this.continuedTasks.set(`cherry-continued-${uuidv7()}`, continued);
    this.publishStatus();
    if (this.isUnprotected()) {
      // Let the caller install its cancellation ownership before notifying it.
      void Promise.resolve().then(() => {
        if (this.isUnprotected()) this.interruptHolder(holder);
      });
    }
    this.enqueueReconcile();
    return {
      release: (outcome) => {
        if (!this.holders.delete(holder)) return;
        if (continued) continued.success = outcome === 'completed';
        this.publishStatus();
        this.enqueueReconcile();
      },
      update: (next) => {
        if (!continued || holder.isInterrupted || !this.holders.has(holder)) return;
        const previous = continued.task;
        if (
          previous.title === next.title &&
          previous.subtitle === next.subtitle &&
          previous.completedUnitCount === next.completedUnitCount &&
          previous.totalUnitCount === next.totalUnitCount
        )
          return;
        continued.task = next;
        this.enqueueReconcile();
      },
    };
  }

  protected async onStop(): Promise<void> {
    this.disposed = true;
    this.holders.clear();
    this.publishStatus();
    this.enqueueReconcile();
    await this.operationTail;
    this.listeners.clear();
  }

  private readonly handleAppStateChange = (state: AppStateStatus): void => {
    if (this.disposed) return;
    if (state === 'active') {
      this.blocked = false;
      this.audioBlocked = false;
      this.audioNeedsRefresh = true;
    } else {
      if (state === 'background' && !this.audioActive) this.audioNeedsRefresh = true;
      this.interruptIfUnprotected();
    }
    this.publishStatus();
    this.enqueueReconcile();
  };

  private enqueueReconcile(): void {
    this.operationTail = this.operationTail
      .then(() => this.reconcile())
      .catch((error: unknown) => {
        logger.error('Background execution cleanup failed', error as Error);
      });
  }

  private async reconcile(): Promise<void> {
    for (const [id, continued] of this.continuedTasks) {
      if (this.disposed || !this.holders.has(continued.holder)) {
        this.continuedTasks.delete(id);
        await this.native?.endContinuedProcessingTask?.(id, continued.success);
      } else if (continued.holder.isInterrupted) {
        if (continued.state !== 'expired') {
          continued.state = 'expired';
          await this.native?.endContinuedProcessingTask?.(id, false);
        }
      } else if (!continued.submitted) {
        continued.submitted = true;
        continued.sent = continued.task;
        try {
          const submitted = await this.native?.beginContinuedProcessingTask?.(id, continued.task);
          // A launch/expiry event may already describe the newer state.
          if (!submitted && continued.state === 'starting') continued.state = 'unavailable';
        } catch (error) {
          if (continued.state === 'starting') continued.state = 'unavailable';
          logger.warn('Continued processing unavailable; using fallback', { error });
        }
      } else if (continued.state === 'active' && continued.sent !== continued.task) {
        continued.sent = continued.task;
        await this.native?.updateContinuedProcessingTask?.(id, continued.task);
      }
    }
    if (this.disposed || this.holders.size === 0) {
      const id = this.taskId;
      this.taskId = undefined;
      try {
        await this.endAudio();
      } finally {
        if (id) await this.native?.endBackgroundExecution?.(id);
      }
      return;
    }
    const audioAllowed =
      this.preference.readCached('app.background_audio.consent') === true &&
      [...this.holders].some((holder) => !holder.isInterrupted) &&
      ![...this.continuedTasks.values()].some(
        // Revoked work retains this fence until its owner has settled cancellation and released.
        (continued) => continued.state !== 'unavailable',
      );
    if (!audioAllowed || this.audioBlocked) await this.endAudio();
    else if (
      this.native?.beginBackgroundAudioExecution &&
      (!this.audioId || this.audioNeedsRefresh)
    ) {
      const audioId = (this.audioId ??= `cherry-audio-${++nextTaskId}`);
      const revision = this.audioRevision;
      this.audioNeedsRefresh = false;
      try {
        const active = await this.native.beginBackgroundAudioExecution(audioId);
        // An interruption event may already describe a newer native state.
        if (this.audioId === audioId && this.audioRevision === revision) this.audioActive = active;
      } catch (error) {
        if (this.audioRevision === revision) this.audioActive = false;
        logger.warn('Background audio unavailable; using the finite window', { error });
      }
      this.publishStatus();
    }
    this.interruptIfUnprotected();
    if (this.taskId || this.blocked) return;
    const id = `cherry-${++nextTaskId}`;
    this.taskId = id;
    this.starting = true;
    this.publishStatus();
    try {
      const admitted = await this.native?.beginBackgroundExecution?.(id);
      if (!admitted && this.taskId === id) {
        this.taskId = undefined;
        this.blocked = true;
        this.interruptIfUnprotected();
      }
    } catch (error) {
      this.taskId = undefined;
      this.blocked = true;
      logger.error('Background execution admission failed', error as Error);
      this.interruptIfUnprotected();
    } finally {
      this.starting = false;
      this.publishStatus();
    }
  }

  private async endAudio(): Promise<void> {
    const id = this.audioId;
    const wasActive = this.audioActive;
    this.audioId = undefined;
    this.audioActive = false;
    if (id || wasActive) this.publishStatus();
    if (id) await this.native?.endBackgroundAudioExecution?.(id);
  }

  private interruptIfUnprotected(): void {
    if (!this.isUnprotected()) return;
    // An exhausted finite window and lost audio cannot restart work in this background stay.
    if (!this.audioBlocked) {
      this.audioBlocked = true;
      this.enqueueReconcile();
    }
    this.interruptHolders();
  }

  private isUnprotected(): boolean {
    return (
      this.blocked &&
      !this.audioActive &&
      ![...this.continuedTasks.values()].some(
        (continued) =>
          continued.state === 'active' &&
          this.holders.has(continued.holder) &&
          !continued.holder.isInterrupted,
      ) &&
      AppState.currentState !== 'active'
    );
  }

  private interruptHolders(): void {
    for (const holder of [...this.holders]) this.interruptHolder(holder);
  }

  private interruptHolder(
    holder: Holder,
    reason = new Error('iOS background execution time expired'),
  ): void {
    if (this.disposed || !this.holders.has(holder) || holder.isInterrupted) return;
    holder.isInterrupted = true;
    try {
      void Promise.resolve(holder.onInterrupt?.(reason)).catch((error: unknown) =>
        logger.error('Background interruption cleanup failed', error as Error),
      );
    } catch (error) {
      logger.error('Background interruption cleanup failed', error as Error);
    }
  }

  private publishStatus(): void {
    for (const listener of this.listeners) listener();
  }
}
