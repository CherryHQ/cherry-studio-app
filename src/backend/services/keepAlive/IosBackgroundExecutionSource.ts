import { AppState, Platform, type AppStateStatus } from 'react-native';

import {
  AppStatePolicy,
  BaseService,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { BackgroundExecutionStatus } from '@/shared/contracts/backgroundExecution';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  getSystemIntegration,
  type SystemIntegrationNativeModule,
} from '../../../../modules/system-integration';
import type { KeepAliveLease, KeepAliveSource } from './KeepAliveCoordinator';

type Holder = {
  onInterrupt?: (reason: Error) => void | Promise<void>;
  isInterrupted: boolean;
};

const logger = loggerService.withContext('IosBackgroundExecution');
let nextTaskId = 0;

/** Logical demand shares one finite UIKit window. Expiration never renews it in background. */
@Injectable('IosBackgroundExecutionSource')
@ServicePhase(Phase.PostReady)
@AppStatePolicy('background-presentation')
export class IosBackgroundExecutionSource extends BaseService implements KeepAliveSource {
  private disposed = false;
  private blocked = false;
  private readonly holders = new Set<Holder>();
  private readonly listeners = new Set<() => void>();
  private native: SystemIntegrationNativeModule | null = null;
  private taskId?: string;
  private starting = false;
  private operationTail: Promise<void> = Promise.resolve();

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
        if (AppState.currentState !== 'active') this.interruptHolders();
        else this.handleAppStateChange('active');
      });
      this.registerDisposable(() => subscription.remove());
    }
    this.registerAppStateListener(this.handleAppStateChange);
  }

  getStatus = (): BackgroundExecutionStatus => {
    if (this.holders.size === 0) return 'idle';
    if (this.blocked && AppState.currentState !== 'active') return 'interrupted';
    return this.starting ? 'starting' : 'limited';
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  acquire(_tag: string, onInterrupt?: Holder['onInterrupt']): KeepAliveLease {
    if (this.disposed) return { release: () => {} };
    const holder: Holder = { onInterrupt, isInterrupted: false };
    this.holders.add(holder);
    this.publishStatus();
    if (this.blocked && AppState.currentState !== 'active') {
      // Let the caller install its cancellation ownership before notifying it.
      void Promise.resolve().then(() => {
        if (this.blocked && AppState.currentState !== 'active') this.interruptHolder(holder);
      });
    }
    this.enqueueReconcile();
    return {
      release: () => {
        if (!this.holders.delete(holder)) return;
        this.publishStatus();
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
    if (state === 'active') this.blocked = false;
    else if (this.blocked) this.interruptHolders();
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
    if (this.disposed || this.holders.size === 0) {
      const id = this.taskId;
      this.taskId = undefined;
      if (id) await this.native?.endBackgroundExecution?.(id);
      return;
    }
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
        if (AppState.currentState !== 'active') this.interruptHolders();
      }
    } catch (error) {
      this.taskId = undefined;
      this.blocked = true;
      logger.error('Background execution admission failed', error as Error);
      if (AppState.currentState !== 'active') this.interruptHolders();
    } finally {
      this.starting = false;
      this.publishStatus();
    }
  }

  private interruptHolders(): void {
    for (const holder of [...this.holders]) this.interruptHolder(holder);
  }

  private interruptHolder(holder: Holder): void {
    if (this.disposed || !this.holders.has(holder) || holder.isInterrupted) return;
    holder.isInterrupted = true;
    try {
      void Promise.resolve(
        holder.onInterrupt?.(new Error('iOS background execution time expired')),
      ).catch((error: unknown) =>
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
