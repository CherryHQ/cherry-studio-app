import type { BackgroundActivityNativePresentation } from '@cherrystudio/ui/background-activity';
import { AppState, type AppStateStatus } from 'react-native';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type {
  KeepAliveLease,
  KeepAliveSource,
} from '@/backend/services/keepAlive/KeepAliveCoordinator';
import {
  BACKGROUND_ACTIVITY_LINGER_MS,
  type BackgroundActivityBaseProps,
} from '@/shared/backgroundActivity/types';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { BackgroundActivityHandle, BackgroundActivityPresenter } from './presenter';

const NATIVE_UPDATE_INTERVAL_MS = 1000;
const logger = loggerService.withContext('BackgroundActivity');

export type BackgroundActivitySessionInput<Props extends BackgroundActivityBaseProps> = {
  deepLinkUrl?: string;
  /** Hold a keep-alive lease while the session runs. Defaults to false. */
  keepAlive?: boolean;
  /** Stops domain work when Android's background execution budget expires. */
  onInterrupt?: (reason: Error) => void | Promise<void>;
  presenter: BackgroundActivityPresenter<Props>;
  props: Props;
  /** Diagnostic label for keep-alive attribution and log correlation; not unique. */
  tag: string;
};

/**
 * Imperative handle for one background surface. Calls never throw; calls
 * after `finish`/`cancel` (or manager disposal) are no-ops.
 */
export type BackgroundActivitySession<Props extends BackgroundActivityBaseProps> = {
  /** Terminal: ends the surface immediately (domain cleanup, deletions). */
  cancel(): void;
  /** Terminal: resolves after queued final delivery settles, on every platform. */
  finish(props: Props): Promise<void>;
  update(props: Props, options?: { keepAlive?: boolean; urgent?: boolean }): void;
};

type SessionRecord = {
  deepLinkUrl?: string;
  /** The session, not its surface: a surface comes and goes while this stays false. */
  ended: boolean;
  keepAlive: boolean;
  lastNativeUpdateAt: number;
  lease?: KeepAliveLease;
  onInterrupt?: (reason: Error) => void | Promise<void>;
  presenter: BackgroundActivityPresenter<BackgroundActivityBaseProps>;
  phaseStartedInBackground: boolean;
  props: BackgroundActivityBaseProps;
  surface: SurfaceState;
  tag: string;
  updateTimer?: ReturnType<typeof setTimeout>;
};

type SurfaceState =
  | { status: 'pending' }
  | { handle: BackgroundActivityHandle<BackgroundActivityBaseProps>; status: 'active' }
  | { status: 'dismissed' }
  | { status: 'unavailable' };

/** An ended surface the platform may still be showing. */
type SettledSurface = {
  deepLinkUrl: string;
  handle: BackgroundActivityHandle<BackgroundActivityBaseProps>;
  retentionTimer: ReturnType<typeof setTimeout>;
};

type BackgroundActivityEnvironmentPort = {
  /** Every presenter whose orphaned surfaces must be swept at cold start. */
  presenters: readonly { clearOrphans(): Promise<number> }[];
  getColorScheme(): 'dark' | 'light';
  isPresentationEnabled(): boolean;
  subscribePresentationEnabled(listener: () => void): () => void;
  prepareLogo(): Promise<string | undefined>;
  /** Emits the deep link of the task surface the user is currently looking at. */
  subscribeVisibleTask(listener: (deepLinkUrl: string | undefined) => void): () => void;
};

/**
 * Feature-agnostic driver for background activity surfaces: a surface exists
 * only inside the window its presenter declares, update/end operations ride one
 * serial queue, updates are throttled (urgent ones jump the throttle), orphans
 * from a dead process are swept during initialization, and each session's
 * `keepAlive` bit is mirrored into a KeepAliveCoordinator lease, with delivery
 * protection declared by its presenter.
 *
 * A surface is disposable, its session is not: an `app-hidden` surface is
 * retired when the user comes back and recreated when they leave again, while
 * the session, its lease, and its content survive untouched. A settled surface
 * that the platform may still be showing stays dismissable until the user opens
 * its destination, so one destination never accumulates cards.
 *
 * Domain meaning (what a session represents, when it is urgent, when to stay
 * alive) belongs to the feature services driving the sessions.
 */
@Injectable('BackgroundActivityManager')
@ServicePhase(Phase.PostReady)
@DependsOn(['KeepAliveCoordinator', 'BackgroundActivityEnvironment'])
@AppStatePolicy('background-presentation')
export class BackgroundActivityManager extends BaseService {
  private appState: AppStateStatus = AppState.currentState;
  private disposed = false;
  private logoUri?: string;
  private operationTail: Promise<void> = Promise.resolve();
  private sessions = new Set<SessionRecord>();
  private settled = new Set<SettledSurface>();

  constructor(
    private readonly keepAlive: KeepAliveSource,
    private readonly environment: BackgroundActivityEnvironmentPort,
  ) {
    super();
  }

  protected async onInit(): Promise<void> {
    this.appState = AppState.currentState;
    this.registerAppStateListener(this.handleAppStateChange);
    this.registerDisposable(
      this.environment.subscribePresentationEnabled(this.handlePresentationEnabledChange),
    );
    this.registerDisposable(
      this.environment.subscribeVisibleTask((deepLinkUrl) => this.dismissTask(deepLinkUrl)),
    );
    await this.clearOrphanedSurfaces();
    // Environments without a logo surface resolve `undefined`; no platform check here.
    this.logoUri = await this.environment.prepareLogo();
  }

  startSession<Props extends BackgroundActivityBaseProps>(
    input: BackgroundActivitySessionInput<Props>,
  ): BackgroundActivitySession<Props> {
    if (this.disposed) return noOpSession();

    const record: SessionRecord = {
      ended: false,
      keepAlive: input.keepAlive ?? false,
      lastNativeUpdateAt: 0,
      onInterrupt: input.onInterrupt,
      presenter: input.presenter as BackgroundActivityPresenter<BackgroundActivityBaseProps>,
      phaseStartedInBackground: this.appState === 'background',
      props: input.props,
      surface: { status: 'pending' },
      tag: input.tag,
      ...(input.deepLinkUrl ? { deepLinkUrl: input.deepLinkUrl } : {}),
    };
    this.sessions.add(record);
    // The new session speaks for this destination now; its predecessor's
    // settled card must not stack underneath.
    this.dismissTask(record.deepLinkUrl);
    this.reconcileLease(record);
    this.startNative(record);

    return {
      cancel: () => {
        void this.settle(record, 'immediate');
      },
      finish: (props) => {
        if (record.ended || this.disposed) return Promise.resolve();
        this.capturePhaseVisibility(record, props);
        record.props = {
          ...props,
          finishedAtEpochMs: props.finishedAtEpochMs ?? Date.now(),
        };
        return this.settle(record, 'default');
      },
      update: (props, options) => this.updateSession(record, props, options),
    };
  }

  /** Retires whatever settled surface is still showing for this destination. */
  dismissTask(deepLinkUrl: string | undefined): void {
    if (!deepLinkUrl) return;
    for (const entry of [...this.settled]) {
      if (entry.deepLinkUrl !== deepLinkUrl) continue;
      this.dismissSettled(entry);
    }
  }

  protected async onStop(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    for (const entry of [...this.settled]) this.forgetSettled(entry);
    const records = [...this.sessions];
    this.sessions.clear();
    const activeSurfaces: {
      handle: BackgroundActivityHandle<BackgroundActivityBaseProps>;
      record: SessionRecord;
    }[] = [];
    for (const record of records) {
      this.clearUpdateTimer(record);
      this.reconcileLease(record);
      this.stampFinishedAt(record);
      if (record.surface.status === 'active') {
        activeSurfaces.push({ handle: record.surface.handle, record });
      }
      record.ended = true;
      record.surface = { status: 'pending' };
    }
    await this.enqueue(async () => {
      await Promise.all(
        activeSurfaces.map(({ handle, record }) => this.endNative(record, handle, 'immediate')),
      );
    });
  }

  private readonly handleAppStateChange = (nextState: AppStateStatus) => {
    if (this.disposed) return;
    this.appState = nextState;
    for (const record of this.sessions) {
      if (nextState === 'active' && record.presenter.presentWhile === 'app-hidden') {
        this.retireSurface(record);
        continue;
      }
      this.startNative(record);
    }
  };

  private readonly handlePresentationEnabledChange = () => {
    if (this.disposed) return;
    if (this.environment.isPresentationEnabled()) {
      for (const record of this.sessions) this.startNative(record);
      return;
    }
    for (const record of this.sessions) this.retireSurface(record);
    for (const entry of [...this.settled]) this.dismissSettled(entry);
  };

  private updateSession(
    record: SessionRecord,
    props: BackgroundActivityBaseProps,
    options?: { keepAlive?: boolean; urgent?: boolean },
  ): void {
    if (record.ended || this.disposed) return;

    const changed = !shallowEqualProps(record.props, props);
    this.capturePhaseVisibility(record, props);
    record.props = props;
    if (options?.keepAlive !== undefined && options.keepAlive !== record.keepAlive) {
      record.keepAlive = options.keepAlive;
      if (record.keepAlive || !record.presenter.shouldHoldLeaseUntilDelivery) {
        this.reconcileLease(record);
      }
    }

    const needsLeaseDrain =
      record.presenter.shouldHoldLeaseUntilDelivery && !!record.lease && !record.keepAlive;
    if ((!changed && !needsLeaseDrain) || record.surface.status !== 'active') {
      this.reconcileLease(record);
      return;
    }

    const elapsed = Date.now() - record.lastNativeUpdateAt;
    if (needsLeaseDrain || options?.urgent || elapsed >= NATIVE_UPDATE_INTERVAL_MS) {
      this.clearUpdateTimer(record);
      void this.enqueue(() => this.updateNative(record));
      return;
    }

    if (!record.updateTimer) {
      record.updateTimer = setTimeout(() => {
        record.updateTimer = undefined;
        void this.enqueue(() => this.updateNative(record));
      }, NATIVE_UPDATE_INTERVAL_MS - elapsed);
    }
  }

  private settle(record: SessionRecord, policy: 'default' | 'immediate'): Promise<void> {
    if (record.ended || this.disposed) return Promise.resolve();
    this.stampFinishedAt(record);
    const handle = this.getActiveSurface(record);
    record.ended = true;
    record.surface = { status: 'pending' };
    this.sessions.delete(record);
    this.clearUpdateTimer(record);
    if (!record.presenter.shouldHoldLeaseUntilDelivery) this.reconcileLease(record);
    if (handle) {
      // Cancellation leaves nothing behind; a settled result can outlive the
      // session on the platform's own surface until the user has seen it.
      // Retained before the end is delivered, so a dismissal arriving while
      // that delivery is in flight still finds it — the queue keeps the
      // dismissal behind the end regardless.
      if (policy === 'default') this.retainSettled(record, handle);
      return this.enqueue(async () => {
        await this.endNative(record, handle, policy);
        this.reconcileLease(record);
      });
    }
    this.reconcileLease(record);
    return Promise.resolve();
  }

  /** Ends a surface whose presentation window closed, leaving its session live. */
  private retireSurface(record: SessionRecord): void {
    const handle = this.getActiveSurface(record);
    // A user's dismissal belongs to this task, not just this visibility window.
    if (record.surface.status === 'dismissed') return;
    record.surface = { status: 'pending' };
    if (!handle) return;
    this.clearUpdateTimer(record);
    void this.enqueue(async () => {
      await this.endNative(record, handle, 'immediate');
      this.reconcileLease(record);
    });
  }

  private startNative(record: SessionRecord): void {
    if (this.disposed || record.ended || record.surface.status !== 'pending') return;
    if (!this.environment.isPresentationEnabled()) return;
    if (record.presenter.presentWhile === 'app-hidden' && this.appState === 'active') return;
    try {
      const handle = record.presenter.start(this.toNativeProps(record), record.deepLinkUrl);
      record.surface = { handle, status: 'active' };
      record.lastNativeUpdateAt = Date.now();
      logger.info('Background activity started', { tag: record.tag });
    } catch (error) {
      // Retried at the next presentation window, never inside the failed one.
      record.surface = { status: 'unavailable' };
      logger.warn('Background activity failed to start', error as Error, { tag: record.tag });
    }
  }

  private async updateNative(record: SessionRecord): Promise<void> {
    if (this.disposed || record.surface.status !== 'active') return;
    const handle = this.getActiveSurface(record);
    if (!handle) return;
    const submittedProps = record.props;
    try {
      await handle.update(this.toNativeProps(record), {
        phaseStartedInBackground: record.phaseStartedInBackground,
      });
      record.lastNativeUpdateAt = Date.now();
    } catch (error) {
      logger.warn('Background activity update failed', error as Error, { tag: record.tag });
    } finally {
      // A newer update or finish owns delivery of its content. An older pending
      // update must not release that operation's execution protection.
      if (
        !record.presenter.shouldHoldLeaseUntilDelivery ||
        (record.surface.status === 'active' && record.props === submittedProps)
      ) {
        this.reconcileLease(record);
      }
    }
  }

  private getActiveSurface(
    record: SessionRecord,
  ): BackgroundActivityHandle<BackgroundActivityBaseProps> | undefined {
    if (record.surface.status !== 'active') return undefined;
    const { handle } = record.surface;
    try {
      if (handle.isActive?.() === false) {
        record.surface = { status: 'dismissed' };
        this.clearUpdateTimer(record);
        return undefined;
      }
    } catch (error) {
      logger.warn('Background activity state lookup failed', error as Error, { tag: record.tag });
    }
    return handle;
  }

  private async endNative(
    record: SessionRecord,
    handle: BackgroundActivityHandle<BackgroundActivityBaseProps>,
    policy: 'default' | 'immediate',
  ): Promise<void> {
    try {
      await handle.end(policy, this.toNativeProps(record), {
        phaseStartedInBackground: record.phaseStartedInBackground,
      });
      logger.info('Background activity ended', { policy, tag: record.tag });
    } catch (error) {
      logger.warn('Background activity cleanup failed', error as Error, { tag: record.tag });
    }
  }

  private retainSettled(
    record: SessionRecord,
    handle: BackgroundActivityHandle<BackgroundActivityBaseProps>,
  ): void {
    const deepLinkUrl = record.deepLinkUrl;
    // Without a destination nothing can report that the user has seen it, and
    // the platform retires the surface on its own.
    if (this.disposed || !deepLinkUrl) return;
    const entry: SettledSurface = {
      deepLinkUrl,
      handle,
      retentionTimer: setTimeout(() => {
        this.settled.delete(entry);
      }, BACKGROUND_ACTIVITY_LINGER_MS),
    };
    this.settled.add(entry);
  }

  private forgetSettled(entry: SettledSurface): void {
    clearTimeout(entry.retentionTimer);
    this.settled.delete(entry);
  }

  private dismissSettled(entry: SettledSurface): void {
    this.forgetSettled(entry);
    void this.enqueue(async () => {
      try {
        await entry.handle.dismiss();
      } catch (error) {
        logger.warn('Background activity dismissal failed', error as Error, {
          deepLinkUrl: entry.deepLinkUrl,
        });
      }
    });
  }

  private toNativeProps(
    record: SessionRecord,
  ): BackgroundActivityNativePresentation<BackgroundActivityBaseProps> {
    return {
      ...record.props,
      colorScheme: this.environment.getColorScheme(),
      ...(this.logoUri ? { logoUri: this.logoUri } : {}),
    };
  }

  private stampFinishedAt(record: SessionRecord): void {
    record.props = {
      ...record.props,
      finishedAtEpochMs: record.props.finishedAtEpochMs ?? Date.now(),
    };
  }

  private capturePhaseVisibility(record: SessionRecord, props: BackgroundActivityBaseProps): void {
    if (record.props.phase !== props.phase) {
      record.phaseStartedInBackground = this.appState === 'background';
    }
  }

  /** Mirrors the session's keep-alive bit into a coordinator lease. */
  private reconcileLease(record: SessionRecord): void {
    const shouldHold = !this.disposed && !record.ended && record.keepAlive;
    if (shouldHold && !record.lease) {
      record.lease = this.keepAlive.acquire(record.tag, record.onInterrupt);
    } else if (!shouldHold && record.lease) {
      record.lease.release();
      record.lease = undefined;
    }
  }

  private async clearOrphanedSurfaces(): Promise<void> {
    for (const presenter of this.environment.presenters) {
      try {
        const count = await presenter.clearOrphans();
        if (count > 0) logger.info('Cleared orphaned background activities', { count });
      } catch (error) {
        logger.warn('Orphaned background activity cleanup failed', error as Error);
      }
    }
  }

  private clearUpdateTimer(record: SessionRecord): void {
    if (record.updateTimer) clearTimeout(record.updateTimer);
    record.updateTimer = undefined;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const run = this.operationTail.then(operation, operation);
    this.operationTail = run.catch(() => {});
    return run;
  }
}

function noOpSession<
  Props extends BackgroundActivityBaseProps,
>(): BackgroundActivitySession<Props> {
  return {
    cancel: () => {},
    finish: async () => {},
    update: () => {},
  };
}

function shallowEqualProps(
  left: BackgroundActivityBaseProps,
  right: BackgroundActivityBaseProps,
): boolean {
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  if (leftKeys.length !== Object.keys(rightRecord).length) return false;
  return leftKeys.every((key) => Object.is(leftRecord[key], rightRecord[key]));
}
