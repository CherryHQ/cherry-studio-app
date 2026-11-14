import { loggerService } from '@logger';
import { randomUUID } from 'expo-crypto';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { AppState } from 'react-native';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  type Disposable,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { PreferenceService } from '@/backend/data/PreferenceService';

import type { ScreenAwakeLease, ScreenAwakePort } from './screenAwakePorts';

const logger = loggerService.withContext('ScreenAwake');
const noOpLease: ScreenAwakeLease = { release: () => {} };

@Injectable('ScreenAwakeRuntime')
@ServicePhase(Phase.PostReady)
@DependsOn(['PreferenceService'])
@AppStatePolicy('foreground-only')
export class ScreenAwakeRuntime extends BaseService implements ScreenAwakePort {
  private initialized = false;
  private disposed = false;
  private enabled = false;
  private appState: typeof AppState.currentState = null;
  private readonly holders = new Set<symbol>();
  private readonly nativeTag = `cherry.screenAwake.${randomUUID()}`;
  private nativeState: boolean | 'uncertain' = false;
  private nativeChain: Promise<void> = Promise.resolve();
  private transition = 0;
  private attemptedTransition = -1;
  private preferenceSubscription?: Disposable;
  private appStateSubscription?: Disposable;

  constructor(
    private readonly preferences: Pick<PreferenceService, 'readCached' | 'subscribeChange'>,
  ) {
    super();
  }

  acquire(tag: string): ScreenAwakeLease {
    if (this.disposed) return noOpLease;
    const holder = Symbol(tag);
    this.holders.add(holder);
    if (this.holders.size === 1) this.enqueueReconcile();
    return {
      release: () => {
        if (this.disposed || !this.holders.delete(holder)) return;
        if (this.holders.size === 0) this.enqueueReconcile();
      },
    };
  }

  protected onInit(): void {
    if (this.disposed) return;
    this.appState = AppState.currentState;
    this.enabled = this.preferences.readCached('app.keep_screen_on.enabled');
    this.preferenceSubscription = this.registerDisposable(
      this.preferences.subscribeChange('app.keep_screen_on.enabled')(() => {
        if (this.disposed) return;
        const enabled = this.preferences.readCached('app.keep_screen_on.enabled');
        if (enabled === this.enabled) return;
        this.enabled = enabled;
        this.enqueueReconcile();
      }),
    );
    this.appStateSubscription = this.registerAppStateListener((appState) => {
      if (this.disposed || appState === this.appState) return;
      this.appState = appState;
      this.enqueueReconcile();
    });
    this.initialized = true;
    this.enqueueReconcile();
  }

  protected async onStop(): Promise<void> {
    this.disposed = true;
    this.holders.clear();
    this.preferenceSubscription?.dispose();
    this.appStateSubscription?.dispose();
    this.enqueueReconcile();
    await this.nativeChain;
  }

  private get desired(): boolean {
    return (
      this.initialized &&
      !this.disposed &&
      this.enabled === true &&
      this.appState === 'active' &&
      this.holders.size > 0
    );
  }

  private enqueueReconcile(): void {
    this.transition += 1;
    // Every meaningful transition queues a fresh demand read after the previous
    // native await. There is no polling or retry loop, and token updates never enter here.
    this.nativeChain = this.nativeChain.then(() => this.reconcile());
  }

  private async reconcile(): Promise<void> {
    const desired = this.desired;
    if (this.nativeState === desired || this.attemptedTransition === this.transition) return;
    // Coalesced callbacks must not retry a failure without a newer transition.
    this.attemptedTransition = this.transition;
    try {
      if (desired) await activateKeepAwakeAsync(this.nativeTag);
      else await deactivateKeepAwake(this.nativeTag);
      this.nativeState = desired;
    } catch (error) {
      // Even a rejected activation may have taken effect on the native side.
      this.nativeState = 'uncertain';
      logger.warn(`Failed to ${desired ? 'activate' : 'deactivate'} screen awake`, error as Error);
    }
  }
}
