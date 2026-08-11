import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { widgetsDirectory } from 'expo-widgets';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import type { KeepAliveLease } from '@/backend/services/keepAlive/KeepAliveCoordinator';
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
  /** Settles after the initial native reconciliation and never rejects. */
  ready: Promise<void>;
  /** Terminal: ends the surface immediately (domain cleanup, deletions). */
  cancel(): void;
  /** Terminal: shows `props` as the final content under the default dismissal. */
  finish(props: Props): void;
  update(props: Props, options?: { keepAlive?: boolean; urgent?: boolean }): void;
};

type SessionRecord = {
  deepLinkUrl?: string;
  handle?: BackgroundActivityHandle<BackgroundActivityBaseProps>;
  keepAlive: boolean;
  lastNativeUpdateAt: number;
  lease?: KeepAliveLease;
  presenter: BackgroundActivityPresenter<BackgroundActivityBaseProps>;
  props: BackgroundActivityBaseProps;
  tag: string;
  terminal: boolean;
  updateTimer?: ReturnType<typeof setTimeout>;
};

type BackgroundActivityManagerDependencies = {
  keepAlive: {
    acquire: (tag: string) => KeepAliveLease;
  };
  /** Every presenter whose orphaned surfaces must be swept at cold start. */
  presenters: readonly { clearOrphans(): Promise<number> }[];
};

/**
 * Feature-agnostic driver for background activity surfaces: native start/
 * update/end ride one serial queue, updates are throttled (urgent ones jump
 * the throttle), surfaces exist only while the app is backgrounded, orphans
 * from a dead process are swept at construction, and each session's
 * `keepAlive` bit is mirrored into a KeepAliveCoordinator lease. Domain
 * meaning (what a session represents, when it is urgent, when to stay alive)
 * belongs to the feature services driving the sessions.
 */
export class BackgroundActivityManager {
  private appState: AppStateStatus = AppState.currentState;
  private appStateSubscription?: ReturnType<typeof AppState.addEventListener>;
  private disposed = false;
  private logoUri?: string;
  private operationTail: Promise<void> = Promise.resolve();
  private sessions = new Set<SessionRecord>();

  constructor(private readonly dependencies: BackgroundActivityManagerDependencies) {
    // The native surface (and the widget logo staging directory) is iOS-only
    // today; session bookkeeping still works elsewhere via no-op presenters.
    if (Platform.OS !== 'ios') return;

    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
    void this.enqueue(async () => {
      await this.clearOrphanedSurfaces();
      await this.prepareLogo();
    });
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
      tag: input.tag,
      terminal: false,
      ...(input.deepLinkUrl ? { deepLinkUrl: input.deepLinkUrl } : {}),
    };
    this.sessions.add(record);
    this.reconcileLease(record);
    const ready = this.enqueue(() => this.reconcileNative(record, true)).catch((error) => {
      logger.error('Background activity session failed to initialize', error as Error, {
        tag: record.tag,
      });
    });

    return {
      ready,
      cancel: () => this.settle(record, 'immediate'),
      finish: (props) => {
        record.props = {
          ...props,
          finishedAtEpochMs: props.finishedAtEpochMs ?? Date.now(),
        };
        this.settle(record, 'default');
      },
      update: (props, options) => this.updateSession(record, props, options),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.appStateSubscription?.remove();

    const records = [...this.sessions];
    this.sessions.clear();
    for (const record of records) {
      this.clearUpdateTimer(record);
      this.reconcileLease(record);
    }
    void this.enqueue(async () => {
      await Promise.all(records.map((record) => this.endNative(record, 'immediate')));
    });
  }

  private readonly handleAppStateChange = (nextState: AppStateStatus) => {
    this.appState = nextState;
    void this.enqueue(async () => {
      if (nextState === 'active') {
        await Promise.all([...this.sessions].map((record) => this.endNative(record, 'immediate')));
        return;
      }

      await Promise.all([...this.sessions].map((record) => this.reconcileNative(record, true)));
    });
  };

  private updateSession(
    record: SessionRecord,
    props: BackgroundActivityBaseProps,
    options?: { keepAlive?: boolean; urgent?: boolean },
  ): void {
    if (record.terminal || this.disposed) return;

    const changed = !shallowEqualProps(record.props, props);
    record.props = props;
    if (options?.keepAlive !== undefined && options.keepAlive !== record.keepAlive) {
      record.keepAlive = options.keepAlive;
      this.reconcileLease(record);
    }

    if (this.appState === 'active' || !changed) return;

    const elapsed = Date.now() - record.lastNativeUpdateAt;
    if (options?.urgent || elapsed >= NATIVE_UPDATE_INTERVAL_MS) {
      this.clearUpdateTimer(record);
      void this.enqueue(() => this.reconcileNative(record, true));
      return;
    }

    if (!record.updateTimer) {
      record.updateTimer = setTimeout(() => {
        record.updateTimer = undefined;
        void this.enqueue(() => this.reconcileNative(record, true));
      }, NATIVE_UPDATE_INTERVAL_MS - elapsed);
    }
  }

  private settle(record: SessionRecord, policy: 'default' | 'immediate'): void {
    if (record.terminal || this.disposed) return;
    record.terminal = true;
    this.sessions.delete(record);
    this.clearUpdateTimer(record);
    this.reconcileLease(record);
    void this.enqueue(() => this.endNative(record, policy));
  }

  private async reconcileNative(record: SessionRecord, forceUpdate: boolean): Promise<void> {
    if (this.disposed || record.terminal || this.appState === 'active') return;

    const props = this.toNativeProps(record);
    if (!record.handle) {
      try {
        record.handle = record.presenter.start(props, record.deepLinkUrl);
        record.lastNativeUpdateAt = Date.now();
        logger.info('Background activity started', { tag: record.tag });
      } catch (error) {
        logger.warn('Background activity failed to start', error as Error, { tag: record.tag });
      }
      return;
    }

    if (!forceUpdate) return;
    try {
      await record.handle.update(props);
      record.lastNativeUpdateAt = Date.now();
    } catch (error) {
      logger.warn('Background activity update failed', error as Error, { tag: record.tag });
    }
  }

  private async endNative(record: SessionRecord, policy: 'default' | 'immediate'): Promise<void> {
    const handle = record.handle;
    if (!handle) return;
    record.handle = undefined;
    try {
      await handle.end(policy, this.toNativeProps(record));
      logger.info('Background activity ended', { policy, tag: record.tag });
    } catch (error) {
      logger.warn('Background activity cleanup failed', error as Error, { tag: record.tag });
    }
  }

  private toNativeProps(record: SessionRecord): BackgroundActivityBaseProps {
    if (!this.logoUri || record.props.logoUri) return record.props;
    return { ...record.props, logoUri: this.logoUri };
  }

  /** Mirrors the session's keep-alive bit into a coordinator lease. */
  private reconcileLease(record: SessionRecord): void {
    const shouldHold = !this.disposed && !record.terminal && record.keepAlive;
    if (shouldHold && !record.lease) {
      record.lease = this.dependencies.keepAlive.acquire(record.tag);
    } else if (!shouldHold && record.lease) {
      record.lease.release();
      record.lease = undefined;
    }
  }

  private async clearOrphanedSurfaces(): Promise<void> {
    for (const presenter of this.dependencies.presenters) {
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
      const destination = new File(widgetsDirectory, 'cherry-studio-logo.png');
      if (!destination.exists) {
        const asset = await Asset.fromModule(
          require('../../../../assets/icon.png'),
        ).downloadAsync();
        if (!asset.localUri) throw new Error('Cherry Studio logo has no local URI.');
        await new File(asset.localUri).copy(destination);
      }
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
