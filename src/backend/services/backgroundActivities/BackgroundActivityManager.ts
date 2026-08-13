import { File } from 'expo-file-system';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { KeepAliveLease } from '@/backend/services/keepAlive/KeepAliveCoordinator';
import { CHERRY_ACTIVITY_LOGO_BASE64 } from '@/shared/backgroundActivities/logo';
import type { BackgroundActivityBaseProps } from '@/shared/backgroundActivities/types';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { BackgroundActivityHandle, BackgroundActivityPresenter } from './presenter';

const NATIVE_UPDATE_INTERVAL_MS = 1000;
const logger = loggerService.withContext('BackgroundActivity');

export type BackgroundActivitySessionInput<Props extends BackgroundActivityBaseProps> = {
  deepLinkUrl?: string;
  /** Hold a keep-alive lease while the session runs. Defaults to false. */
  keepAlive?: boolean;
  presenter: BackgroundActivityPresenter<Props>;
  props: Props;
  /** Stable owner id — keep-alive attribution and log correlation. */
  tag: string;
};

/**
 * Imperative handle for one background surface. Calls never throw; calls
 * after `finish`/`cancel` (or manager disposal) are no-ops.
 */
export type BackgroundActivitySession<Props extends BackgroundActivityBaseProps> = {
  /** Resolves after registration as pending or the first foreground start attempt; never rejects. */
  ready: Promise<void>;
  /** Terminal: ends the surface immediately (domain cleanup, deletions). */
  cancel(): void;
  /** Terminal: shows `props` as the final content under the default dismissal. */
  finish(props: Props): void;
  update(props: Props, options?: { keepAlive?: boolean; urgent?: boolean }): void;
};

type SessionRecord = {
  deepLinkUrl?: string;
  keepAlive: boolean;
  lastNativeUpdateAt: number;
  lease?: KeepAliveLease;
  presenter: BackgroundActivityPresenter<BackgroundActivityBaseProps>;
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

type KeepAlivePort = { acquire: (tag: string) => KeepAliveLease };
type BackgroundActivityEnvironmentPort = {
  /** Every presenter whose orphaned surfaces must be swept at cold start. */
  presenters: readonly { clearOrphans(): Promise<number> }[];
  getColorScheme(): 'dark' | 'light';
};

/**
 * Feature-agnostic driver for background activity surfaces: foreground starts
 * are synchronous, update/end operations ride one serial queue, updates are
 * throttled (urgent ones jump the throttle), foreground-created surfaces
 * survive AppState transitions, orphans from a dead process are swept during
 * initialization, and each session's `keepAlive` bit is mirrored into a
 * KeepAliveCoordinator lease. Domain meaning (what a session represents, when
 * it is urgent, when to stay alive) belongs to the feature services driving
 * the sessions.
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
    private readonly keepAlive: KeepAlivePort,
    private readonly environment: BackgroundActivityEnvironmentPort,
  ) {
    super();
  }

  protected async onInit(): Promise<void> {
    // The native surface (and the widget logo staging directory) is iOS-only
    // today; session bookkeeping still works elsewhere via no-op presenters.
    if (Platform.OS !== 'ios') return;

    this.registerAppStateListener(this.handleAppStateChange);
    await this.clearOrphanedSurfaces();
    await this.prepareLogo();
  }

  startSession<Props extends BackgroundActivityBaseProps>(
    input: BackgroundActivitySessionInput<Props>,
  ): BackgroundActivitySession<Props> {
    if (this.disposed) return noOpSession();

    const record: SessionRecord = {
      keepAlive: input.keepAlive ?? false,
      lastNativeUpdateAt: 0,
      presenter: input.presenter as BackgroundActivityPresenter<BackgroundActivityBaseProps>,
      props: input.props,
      surface: { status: 'pending' },
      tag: input.tag,
      ...(input.deepLinkUrl ? { deepLinkUrl: input.deepLinkUrl } : {}),
    };
    this.sessions.add(record);
    this.reconcileLease(record);
    this.startNative(record);

    return {
      ready: Promise.resolve(),
      cancel: () => this.settle(record, 'immediate'),
      finish: (props) => {
        if (record.surface.status === 'ended' || this.disposed) return;
        record.props = {
          ...props,
          finishedAtEpochMs: props.finishedAtEpochMs ?? Date.now(),
        };
        this.settle(record, 'default');
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
    record.props = props;
    if (options?.keepAlive !== undefined && options.keepAlive !== record.keepAlive) {
      record.keepAlive = options.keepAlive;
      this.reconcileLease(record);
    }

    if (!changed || record.surface.status !== 'active') return;

    const elapsed = Date.now() - record.lastNativeUpdateAt;
    if (options?.urgent || elapsed >= NATIVE_UPDATE_INTERVAL_MS) {
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

  private settle(record: SessionRecord, policy: 'default' | 'immediate'): void {
    if (record.surface.status === 'ended' || this.disposed) return;
    this.stampFinishedAt(record);
    const handle = record.surface.status === 'active' ? record.surface.handle : undefined;
    record.surface = { status: 'ended' };
    this.sessions.delete(record);
    this.clearUpdateTimer(record);
    this.reconcileLease(record);
    if (handle) void this.enqueue(() => this.endNative(record, handle, policy));
  }

  private startNative(record: SessionRecord): void {
    if (this.disposed || this.appState !== 'active' || record.surface.status !== 'pending') return;
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
    try {
      await record.surface.handle.update(this.toNativeProps(record));
      record.lastNativeUpdateAt = Date.now();
    } catch (error) {
      logger.warn('Background activity update failed', error as Error, { tag: record.tag });
    }
  }

  private async endNative(
    record: SessionRecord,
    handle: BackgroundActivityHandle<BackgroundActivityBaseProps>,
    policy: 'default' | 'immediate',
  ): Promise<void> {
    try {
      await handle.end(policy, this.toNativeProps(record));
      logger.info('Background activity ended', { policy, tag: record.tag });
    } catch (error) {
      logger.warn('Background activity cleanup failed', error as Error, { tag: record.tag });
    }
  }

  private toNativeProps(record: SessionRecord): BackgroundActivityBaseProps {
    return {
      ...record.props,
      colorScheme: this.environment.getColorScheme(),
      ...(this.logoUri && !record.props.logoUri ? { logoUri: this.logoUri } : {}),
    };
  }

  private stampFinishedAt(record: SessionRecord): void {
    record.props = {
      ...record.props,
      finishedAtEpochMs: record.props.finishedAtEpochMs ?? Date.now(),
    };
  }

  /** Mirrors the session's keep-alive bit into a coordinator lease. */
  private reconcileLease(record: SessionRecord): void {
    const shouldHold = !this.disposed && record.surface.status !== 'ended' && record.keepAlive;
    if (shouldHold && !record.lease) {
      record.lease = this.keepAlive.acquire(record.tag);
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

  private async prepareLogo(): Promise<void> {
    try {
      // `expo-widgets` resolves its iOS native module at import time. Loading it
      // here keeps the service registry importable on platforms and in tests
      // where that native module does not exist; this method only runs on iOS.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native-module load
      const { widgetsDirectory } = require('expo-widgets') as typeof import('expo-widgets');
      const destination = new File(widgetsDirectory, 'cherry-studio-logo.png');
      destination.write(CHERRY_ACTIVITY_LOGO_BASE64, { encoding: 'base64' });
      this.logoUri = destination.uri;
    } catch (error) {
      logger.warn('Background activity logo preparation failed', error as Error);
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
    ready: Promise.resolve(),
    cancel: () => {},
    finish: () => {},
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
