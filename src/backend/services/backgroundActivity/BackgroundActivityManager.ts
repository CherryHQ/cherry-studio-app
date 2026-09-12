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
import type { BackgroundActivityBaseProps } from '@/shared/backgroundActivity/types';
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
  | { status: 'unavailable' }
  | { status: 'ended' };

type BackgroundActivityEnvironmentPort = {
  /** Every presenter whose orphaned surfaces must be swept at cold start. */
  presenters: readonly { clearOrphans(): Promise<number> }[];
  getColorScheme(): 'dark' | 'light';
  prepareLogo(): Promise<string | undefined>;
};

/**
 * Feature-agnostic driver for background activity surfaces: admitted starts
 * are synchronous, update/end operations ride one serial queue, updates are
 * throttled (urgent ones jump the throttle), foreground-created surfaces
 * survive AppState transitions, orphans from a dead process are swept during
 * initialization, and each session's `keepAlive` bit is mirrored into a
 * KeepAliveCoordinator lease, with delivery protection declared by its presenter.
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

  constructor(
    private readonly keepAlive: KeepAliveSource,
    private readonly environment: BackgroundActivityEnvironmentPort,
  ) {
    super();
  }

  protected async onInit(): Promise<void> {
    this.appState = AppState.currentState;
    this.registerAppStateListener(this.handleAppStateChange);
    await this.clearOrphanedSurfaces();
    // Environments without a logo surface resolve `undefined`; no platform check here.
    this.logoUri = await this.environment.prepareLogo();
  }

  startSession<Props extends BackgroundActivityBaseProps>(
    input: BackgroundActivitySessionInput<Props>,
  ): BackgroundActivitySession<Props> {
    if (this.disposed) return noOpSession();

    const record: SessionRecord = {
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
    this.reconcileLease(record);
    this.startNative(record);

    return {
      cancel: () => {
        void this.settle(record, 'immediate');
      },
      finish: (props) => {
        if (record.surface.status === 'ended' || this.disposed) return Promise.resolve();
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

  protected async onStop(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

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
      record.surface = { status: 'ended' };
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
    if (nextState === 'active') {
      for (const record of this.sessions) this.startNative(record);
    }
  };

  private updateSession(
    record: SessionRecord,
    props: BackgroundActivityBaseProps,
    options?: { keepAlive?: boolean; urgent?: boolean },
  ): void {
    if (record.surface.status === 'ended' || this.disposed) return;

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
    if (record.surface.status === 'ended' || this.disposed) return Promise.resolve();
    this.stampFinishedAt(record);
    const handle = record.surface.status === 'active' ? record.surface.handle : undefined;
    record.surface = { status: 'ended' };
    this.sessions.delete(record);
    this.clearUpdateTimer(record);
    if (!record.presenter.shouldHoldLeaseUntilDelivery) this.reconcileLease(record);
    if (handle) {
      return this.enqueue(async () => {
        await this.endNative(record, handle, policy);
        this.reconcileLease(record);
      });
    }
    this.reconcileLease(record);
    return Promise.resolve();
  }

  private startNative(record: SessionRecord): void {
    if (this.disposed || record.surface.status !== 'pending') return;
    if (!record.presenter.canStartInBackground && this.appState !== 'active') return;
    try {
      const handle = record.presenter.start(this.toNativeProps(record), record.deepLinkUrl);
      record.surface = { handle, status: 'active' };
      record.lastNativeUpdateAt = Date.now();
      logger.info('Background activity started', { tag: record.tag });
    } catch (error) {
      record.surface = { status: 'unavailable' };
      logger.warn('Background activity failed to start', error as Error, { tag: record.tag });
    }
  }

  private async updateNative(record: SessionRecord): Promise<void> {
    if (this.disposed || record.surface.status !== 'active') return;
    const submittedProps = record.props;
    try {
      await record.surface.handle.update(this.toNativeProps(record), {
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
    const shouldHold = !this.disposed && record.surface.status !== 'ended' && record.keepAlive;
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
