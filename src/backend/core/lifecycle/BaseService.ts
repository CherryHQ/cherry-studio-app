import { loggerService } from '@logger';
import { AppState, type AppStateStatus } from 'react-native';

import { getServiceName } from './decorators';
import { type Disposable, toDisposable } from './event';
import { isActivatable, isPausable, LifecycleState, type ServiceConstructor } from './types';

const logger = loggerService.withContext('Lifecycle');

/**
 * Base class for every lifecycle-managed service.
 *
 * Ported from Cherry Desktop `src/main/core/lifecycle/BaseService.ts` with three
 * changes, each forced by the runtime rather than chosen:
 *
 * - `ipcHandle`/`ipcOn` are gone. There is no `ipcMain` here.
 * - The WeakSet that rejected a second instantiation is gone. It encodes "one
 *   instantiation per process", which is false on mobile: every ApplicationHost
 *   generation re-instantiates its services, and tests install a host per case.
 *   The container enforces one live instance per host instead.
 * - `registerAppStateListener` is added. Five call sites currently hand-roll
 *   `AppState.addEventListener` plus a matching `remove()`; routing them through
 *   the disposable bag removes that leak class.
 *
 * Hooks are protected and default to no-ops. The framework calls the `_do*`
 * methods; services never call them directly.
 */
export abstract class BaseService {
  private lifecycleState: LifecycleState = LifecycleState.Created;

  /** Ensures `onAllReady` runs at most once per instance, even across restarts. */
  private allReadyCalled = false;

  private disposables: Disposable[] = [];

  private activated = false;

  /** Serializes activation changes so preference events cannot overtake teardown. */
  private activationTransition: Promise<void> = Promise.resolve();

  /**
   * Whether `_doStop()` is currently running. Distinct from
   * `state === Stopping`, which a rejected `onStop()` also leaves behind — see
   * `_doDestroy()`.
   */
  private stopInFlight = false;

  get state(): LifecycleState {
    return this.lifecycleState;
  }

  get isReady(): boolean {
    return this.lifecycleState === LifecycleState.Ready;
  }

  get isDestroyed(): boolean {
    return this.lifecycleState === LifecycleState.Destroyed;
  }

  get isPaused(): boolean {
    return this.lifecycleState === LifecycleState.Paused;
  }

  get isStopped(): boolean {
    return this.lifecycleState === LifecycleState.Stopped;
  }

  /** Only meaningful for `Activatable` services; always false otherwise. */
  get isActivated(): boolean {
    return this.activated;
  }

  protected setState(state: LifecycleState): void {
    this.lifecycleState = state;
  }

  /**
   * Register a resource for automatic release after `onStop`/`onDestroy`.
   * Accepts a `Disposable` or a plain cleanup function, and returns it so it can
   * be assigned inline.
   */
  protected registerDisposable<T extends Disposable>(disposable: T): T;
  protected registerDisposable(dispose: () => void): Disposable;
  protected registerDisposable<T extends Disposable>(
    disposableOrFn: T | (() => void),
  ): T | Disposable {
    const disposable =
      typeof disposableOrFn === 'function' ? toDisposable(disposableOrFn) : disposableOrFn;
    this.disposables.push(disposable);
    return disposable;
  }

  /**
   * Register a recurring timer scoped to this service.
   *
   * Rejections are logged and the loop survives them. Desktop additionally
   * `unref()`s the handle to keep Node from staying alive for it; Hermes has no
   * such API and no such problem.
   *
   * Not suitable for a timer that should follow activation rather than the
   * service lifetime — manage those inside `onActivate`/`onDeactivate`.
   */
  protected registerInterval(callback: () => void | Promise<void>, intervalMs: number): Disposable {
    const handle = setInterval(async () => {
      try {
        await callback();
      } catch (error) {
        logger.error(`[${this.serviceName}] registerInterval callback failed`, error as Error);
      }
    }, intervalMs);
    return this.registerDisposable(() => clearInterval(handle));
  }

  /**
   * Subscribe to foreground/background transitions for this service's lifetime.
   *
   * The framework itself does nothing on `AppState` changes: the five existing
   * subscribers want mutually incompatible things (query refocus, audio restart,
   * native surface rebuild, one-shot return waiter), so there is no correct
   * default. A service declares its intent with `@AppStatePolicy` and implements
   * it here.
   */
  protected registerAppStateListener(listener: (status: AppStateStatus) => void): Disposable {
    const subscription = AppState.addEventListener('change', listener);
    return this.registerDisposable(() => subscription.remove());
  }

  private releaseDisposables(): void {
    for (const disposable of this.disposables) {
      try {
        disposable.dispose();
      } catch (error) {
        logger.error(`[${this.serviceName}] disposable failed to release`, error as Error);
      }
    }
    this.disposables = [];
  }

  private get serviceName(): string {
    return getServiceName(this.constructor as ServiceConstructor);
  }

  /** Dependencies are `Ready` by the time this runs. */
  protected onInit(): Promise<void> | void {}

  /** This service finished initializing. */
  protected onReady(): Promise<void> | void {}

  /**
   * Every service in every phase finished initializing, so any service may be
   * resolved regardless of `@DependsOn`.
   *
   * Schedule work here; do not perform it. A long await stalls the phase and
   * collides with the teardown ceiling — register a timer and join it in
   * `onStop` instead.
   */
  protected onAllReady(): Promise<void> | void {}

  /** Release work and let in-flight operations settle. Disposables are released afterwards. */
  protected onStop(): Promise<void> | void {}

  /** Final release, after every service has stopped. */
  protected onDestroy(): Promise<void> | void {}

  /** Framework entry point. Runs `onInit` then `onReady`. */
  async _doInit(): Promise<void> {
    this.lifecycleState = LifecycleState.Initializing;
    await this.onInit();
    this.lifecycleState = LifecycleState.Ready;
    await this.onReady();
  }

  /** Framework entry point. At most once per instance. */
  async _doAllReady(): Promise<void> {
    if (this.allReadyCalled) return;
    this.allReadyCalled = true;
    await this.onAllReady();
  }

  /** Framework entry point. Auto-deactivates, runs `onStop`, then releases disposables. */
  async _doStop(): Promise<void> {
    this.lifecycleState = LifecycleState.Stopping;
    this.stopInFlight = true;
    try {
      // An activation that started while Ready owns resources until its hook
      // settles. Wait for it before deciding whether deactivation is needed;
      // setting Stopping first also makes queued activations no-op.
      if (isActivatable(this)) {
        await this.enqueueActivationTransition(async () => {
          if (!this.activated) return;
          try {
            await this.onDeactivate();
          } catch {
            // Best effort — the service logs its own failure, and it must not
            // block onStop.
          }
          this.activated = false;
        });
      }
      await this.onStop();
    } finally {
      this.stopInFlight = false;
      this.releaseDisposables();
    }
    this.lifecycleState = LifecycleState.Stopped;
  }

  /** Framework entry point. Idempotent. */
  async _doDestroy(): Promise<void> {
    if (this.lifecycleState === LifecycleState.Destroyed) {
      return;
    }

    // An abandoned `_doStop()` keeps running after the ceiling expires.
    // Destroying underneath it would tear down the resources that work is still
    // using, so skip; the caller turns the unchanged state into a non-completed
    // outcome.
    //
    // Keyed on the in-flight flag rather than on `Stopping`: a rejected
    // `onStop()` also leaves the state at `Stopping`, but it has already settled
    // and already released its disposables, so nothing is running underneath it.
    if (this.stopInFlight) {
      logger.warn(`Skipping destroy for '${this.serviceName}' — stop still in flight`);
      return;
    }

    // Destroy is terminal. Closing the Ready window before waiting prevents an
    // activation queued concurrently from reacquiring resources underneath it.
    this.lifecycleState = LifecycleState.Stopping;
    if (isActivatable(this)) {
      await this.enqueueActivationTransition(async () => {
        if (!this.activated) return;
        try {
          await this.onDeactivate();
        } catch {
          // Best effort.
        }
        this.activated = false;
      });
    }

    await this.onDestroy();
    this.releaseDisposables();
    this.lifecycleState = LifecycleState.Destroyed;
  }

  /** Framework entry point. Idempotent; returns the resulting activation state. */
  async _doActivate(): Promise<boolean> {
    if (!isActivatable(this)) return false;
    return this.enqueueActivationTransition(async () => {
      if (this.lifecycleState !== LifecycleState.Ready) return false;
      if (this.activated) return true;
      await this.onActivate();
      this.activated = true;
      return true;
    });
  }

  /** Framework entry point. Idempotent. */
  async _doDeactivate(): Promise<boolean> {
    if (!isActivatable(this)) return false;
    return this.enqueueActivationTransition(async () => {
      if (!this.activated) return true;
      await this.onDeactivate();
      this.activated = false;
      return true;
    });
  }

  private enqueueActivationTransition<T>(transition: () => Promise<T>): Promise<T> {
    const run = this.activationTransition.then(transition);
    this.activationTransition = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Self-activation, for use inside the service. External callers go through the host. */
  protected async activate(): Promise<boolean> {
    return this._doActivate();
  }

  /** Self-deactivation, for use inside the service. */
  protected async deactivate(): Promise<boolean> {
    return this._doDeactivate();
  }

  /** Framework entry point. Returns false when the service is not `Pausable`. */
  async _doPause(): Promise<boolean> {
    if (!isPausable(this)) return false;
    this.lifecycleState = LifecycleState.Pausing;
    await this.onPause();
    this.lifecycleState = LifecycleState.Paused;
    return true;
  }

  /** Framework entry point. Returns false when the service is not `Pausable`. */
  async _doResume(): Promise<boolean> {
    if (!isPausable(this)) return false;
    this.lifecycleState = LifecycleState.Resuming;
    await this.onResume();
    this.lifecycleState = LifecycleState.Ready;
    return true;
  }
}
