import { AppState, Platform } from 'react-native';
import type BackgroundService from 'react-native-background-actions';

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
import { KeepAliveInterruptionError } from '@/backend/services/keepAlive/KeepAliveInterruptionError';
import type { BackgroundReplyActivityProps } from '@/shared/backgroundActivity/chatReply';
import type { PaintingActivityProps } from '@/shared/backgroundActivity/painting';
import { BACKGROUND_NOTIFICATION_OWNER } from '@/shared/backgroundActivity/types';
import type { BackgroundExecutionStatus } from '@/shared/contracts/backgroundExecution';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  getSystemIntegration,
  type SystemIntegrationNativeModule,
} from '../../../../modules/system-integration';
import type { BackgroundActivityEnvironment } from './BackgroundActivityEnvironment';
import type { BackgroundActivityPresenter } from './presenter';

// Android 15 gives dataSync six background hours, reset on foreground entry.
// Leave a minute for the domain's normal cancellation and notification drain.
const BACKGROUND_EXECUTION_LIMIT_MS = (6 * 60 - 1) * 60_000;
const logger = loggerService.withContext('AndroidBackgroundActivity');

// background-actions owns the Headless JS task and wake lock until stop(). A
// pending promise avoids its automatic task-return -> stop() path racing a
// subsequent run. It holds no ApplicationHost or business-task references.
const holdBackgroundExecution = () => new Promise<void>(() => {});

type ActivityProps = BackgroundReplyActivityProps | PaintingActivityProps;
type ActivityRecord = {
  attention?: 'terminal' | 'approval';
  cancelled?: boolean;
  deepLinkUrl?: string;
  id: number;
  lastDelivered?: ActivityProps;
  phaseStartedInBackground: boolean;
  latestProps: ActivityProps;
  props: ActivityProps;
};
type LeaseRecord = { onInterrupt?: (reason: Error) => void | Promise<void> };
type Notifications = typeof import('expo-notifications');
type ServiceContent = {
  notificationId: number;
  taskOngoing: boolean;
  taskTitle: string;
  taskDesc: string;
  linkingURI?: string;
};

/** Owns execution demand and conversation cards; background-actions owns the native service. */
@Injectable('AndroidBackgroundActivityRuntime')
@ServicePhase(Phase.PostReady)
@DependsOn(['BackgroundActivityEnvironment'])
@AppStatePolicy('background-presentation')
export class AndroidBackgroundActivityRuntime extends BaseService implements KeepAliveSource {
  private readonly activities = new Set<ActivityRecord>();
  private readonly leases = new Set<LeaseRecord>();
  private background?: typeof BackgroundService;
  private notifications?: Notifications;
  private backgroundStartedAt?: number;
  private backgroundLimitReached = false;
  private deadlineTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private interrupting = false;
  private nextId = 0;
  private operationTail: Promise<void> = Promise.resolve();
  private permissionRequested = false;
  private unprotected = false;
  private interrupted = false;
  private native?: SystemIntegrationNativeModule | null;
  private readonly statusListeners = new Set<() => void>();
  private lastServiceContent?: ServiceContent;

  constructor(
    private readonly environment: Pick<
      BackgroundActivityEnvironment,
      'isReplyCompletionNotificationEnabled' | 'translate' | 'onForegroundAttention'
    >,
  ) {
    super();
  }

  getStatus = (): BackgroundExecutionStatus => {
    if (this.interrupted) return 'interrupted';
    if (this.leases.size === 0) return 'idle';
    if (this.unprotected) return 'limited';
    if (!this.background?.isRunning()) return 'starting';
    return this.background.isProtected() && this.native?.showBackgroundTaskNotification
      ? 'active'
      : 'limited';
  };

  subscribe = (listener: () => void) => {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  };

  private publishStatus(): void {
    for (const listener of this.statusListeners) listener();
  }

  dismissCompletedTask = async (deepLinkUrl: string): Promise<void> => {
    if ([...this.activities].some((record) => record.deepLinkUrl === deepLinkUrl)) return;
    await this.native?.dismissCompletedBackgroundTaskNotification?.(deepLinkUrl);
  };

  protected async onInit(): Promise<void> {
    if (Platform.OS !== 'android') return;
    // Match the other native services' lazy loading so iOS never evaluates
    // these modules and CommonJS test environments can use the native mocks.
    const { default: background } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native-module load
      require('react-native-background-actions') as typeof import('react-native-background-actions');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native-module load
    const notifications = require('expo-notifications') as Notifications;
    this.background = background;
    this.notifications = notifications;
    this.native = getSystemIntegration();
    const handleProtectionChanged = () => this.publishStatus();
    background.on('protectionChanged', handleProtectionChanged);
    this.registerDisposable(() => background.off('protectionChanged', handleProtectionChanged));
    const handleServiceStopped = () => {
      void this.interruptLeases(new KeepAliveInterruptionError('service-stopped')).catch(
        (error: unknown) => logger.warn('Background service interruption failed', { error }),
      );
    };
    background.on('stopped', handleServiceStopped);
    this.registerDisposable(() => background.off('stopped', handleServiceStopped));
    notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: AppState.currentState === 'background',
        shouldSetBadge: false,
        shouldShowBanner: AppState.currentState === 'background',
        shouldShowList: AppState.currentState === 'background',
      }),
    });
    this.registerDisposable(() => notifications.setNotificationHandler(null));
    this.registerAppStateListener((state) => {
      if (state === 'active') {
        this.backgroundStartedAt = undefined;
        this.backgroundLimitReached = false;
        this.unprotected = false;
        this.clearDeadline();
        this.scheduleReconcile();
      } else {
        this.backgroundStartedAt ??= Date.now();
        this.armDeadline();
      }
    });
    // The notification bridge creates channels at delivery, after locale initialization.
    await this.native?.clearBackgroundTaskNotifications?.();
    // Never restore a dead process's stream or replay paid work.
    for (const notification of await notifications.getPresentedNotificationsAsync()) {
      const data = notification.request.content.data;
      if (data?.owner === BACKGROUND_NOTIFICATION_OWNER && data.terminal !== true) {
        await notifications.dismissNotificationAsync(notification.request.identifier);
      }
    }
  }

  acquire(_tag: string, onInterrupt?: (reason: Error) => void | Promise<void>): KeepAliveLease {
    if (!this.background || this.disposed) return { release() {} };
    if (this.backgroundLimitReached && AppState.currentState !== 'active') {
      void Promise.resolve()
        .then(() => onInterrupt?.(new KeepAliveInterruptionError('execution-limit')))
        .catch((error: unknown) => logger.warn('Background task interruption failed', { error }));
      return { release() {} };
    }
    this.interrupted = false;
    const lease: LeaseRecord = { onInterrupt };
    this.leases.add(lease);
    this.publishStatus();
    this.scheduleReconcile();
    return {
      release: () => {
        if (!this.leases.delete(lease)) return;
        // Later work gets its own admission attempt once the unprotected work has ended.
        if (this.leases.size === 0) this.unprotected = false;
        this.publishStatus();
        this.scheduleReconcile();
      },
    };
  }

  createPresenter<Props extends ActivityProps>(): BackgroundActivityPresenter<Props> {
    return {
      // A notification represents a task the execution runtime already admitted,
      // whether or not the user can see the app, and a queued task can join an
      // already-running service in the background. Hold protection only through
      // notification submission, never through presentation.
      presentWhile: 'always',
      shouldHoldLeaseUntilDelivery: true,
      clearOrphans: async () => 0,
      start: (props, deepLinkUrl) => {
        const record: ActivityRecord = {
          deepLinkUrl,
          id:
            this.native?.getBackgroundTaskNotificationId?.(
              deepLinkUrl ?? `activity:${this.nextId++}`,
            ) ?? 100000 + this.nextId++,
          phaseStartedInBackground: AppState.currentState === 'background',
          latestProps: props,
          props,
        };
        if (!this.disposed) {
          // A new generation owns this identity. Queued predecessors may no
          // longer post a terminal update over its ongoing notification.
          for (const previous of this.activities) {
            if (previous.id === record.id) this.activities.delete(previous);
          }
          this.activities.add(record);
        }
        this.scheduleReconcile();
        return {
          // The posted notification outlives its task record; a focused surface
          // clears it here as well as through App Shell's own acknowledgement.
          dismiss: () =>
            this.enqueue(async () => {
              if ([...this.activities].some((current) => current.id === record.id)) return;
              await this.native?.dismissBackgroundTaskNotification?.(record.id);
            }),
          update: (nextProps, context) => {
            record.latestProps = nextProps;
            const occurredInBackground =
              context?.phaseStartedInBackground ?? AppState.currentState === 'background';
            return this.enqueue(async () => {
              if (!this.activities.has(record) || this.disposed) return;
              const previousPhase = record.props.phase;
              record.props = nextProps;
              if (previousPhase !== nextProps.phase)
                record.phaseStartedInBackground = occurredInBackground;
              if (record.attention === 'terminal' && !isTerminal(nextProps.phase)) {
                record.attention = undefined;
              }
              if (previousPhase === 'awaiting-approval' && nextProps.phase !== previousPhase) {
                record.attention = undefined;
              }
              // Even superseded phases must reset the previous turn's notification state.
              if (record.latestProps !== nextProps) return;
              await this.reconcile();
            });
          },
          end: (policy, finalProps, context) => {
            record.latestProps = finalProps;
            record.cancelled = policy !== 'default' || finalProps.phase === 'cancelled';
            const occurredInBackground =
              context?.phaseStartedInBackground ?? AppState.currentState === 'background';
            return this.enqueue(async () => {
              if (!this.activities.has(record) || this.disposed) return;
              if (record.props.phase !== finalProps.phase)
                record.phaseStartedInBackground = occurredInBackground;
              record.props = finalProps;
              if (record.cancelled) {
                this.activities.delete(record);
                await this.reconcile();
                await this.native?.dismissBackgroundTaskNotification?.(record.id);
              } else {
                // Settle the service notification in place first. Native code detaches a
                // settled identity before handing service ownership to a survivor or
                // stopping, so Android never cancels the result.
                await this.settleAnchor(record);
                await this.reconcile();
                this.activities.delete(record);
              }
            });
          },
        };
      },
    };
  }

  protected async onStop(): Promise<void> {
    this.disposed = true;
    this.clearDeadline();
    this.leases.clear();
    this.publishStatus();
    await this.enqueue(async () => {
      await this.stopService();
      await Promise.all(
        [...this.activities].map(({ id }) => this.native?.dismissBackgroundTaskNotification?.(id)),
      );
      this.activities.clear();
    });
  }

  private scheduleReconcile(): void {
    if (this.disposed) return;
    void this.enqueue(() => this.reconcile()).catch((error: unknown) => {
      logger.warn('Background service update failed', error as Error);
    });
  }

  private async reconcile(): Promise<void> {
    const background = this.background;
    if (!background || this.interrupting) return;
    if (this.disposed || this.leases.size === 0) {
      await this.stopService();
      if (!this.disposed) await this.publishNotifications();
      return;
    }
    const content = this.runningContent();
    try {
      if (!background.isRunning()) {
        if (this.unprotected) return;
        // Android 12+: start only from a visible Activity, never from a background retry.
        if (AppState.currentState !== 'active' || this.backgroundLimitReached) {
          this.continueUnprotected(new Error('Background execution was requested while hidden.'));
          return;
        }
        try {
          await background.start(holdBackgroundExecution, {
            ...content,
            // Native execution stays foreground until the last task releases it.
            taskName: 'CherryBackgroundGeneration',
            taskIcon: { name: 'notification_icon', type: 'drawable' },
            foregroundServiceType: ['dataSync'],
            progressBar: { max: 1, value: 0, indeterminate: true },
          });
        } catch (error) {
          this.continueUnprotected(error);
          return;
        }
      }
      if (JSON.stringify(content) !== JSON.stringify(this.lastServiceContent)) {
        await background.updateNotification(content);
        this.lastServiceContent = content;
      }
      this.publishStatus();
      this.armDeadline();
    } finally {
      if (!this.disposed) await this.publishNotifications();
      // Request after admission, including a failed attempt or a return while running.
      // The permission sheet must not race admission or depend on its success.
      if (!this.disposed && !this.permissionRequested && AppState.currentState === 'active') {
        this.permissionRequested = true;
        void this.notifications?.requestPermissionsAsync().catch((error: unknown) => {
          this.permissionRequested = false;
          logger.warn('Notification permission request failed', error as Error);
        });
      }
    }
  }

  /**
   * Protection is best effort: work that could not get it keeps running and ends through its
   * own result or a real platform revocation. Returning to the foreground retries admission.
   */
  private continueUnprotected(cause: unknown): void {
    this.unprotected = true;
    this.publishStatus();
    logger.error('Background execution is unprotected', cause as Error, {
      operation: 'background.start',
      appState: AppState.currentState,
      leaseCount: this.leases.size,
    });
  }

  private async stopService(): Promise<void> {
    this.clearDeadline();
    if (this.background?.isRunning()) await this.background.stop();
    this.lastServiceContent = undefined;
    this.publishStatus();
  }

  private runningContent(): ServiceContent {
    const records = [...this.activities].filter((record) => !record.cancelled);
    const first = records.find(({ props }) => !isTerminal(props.phase)) ?? records[0];
    if (first) return this.serviceContent(first);
    return (
      this.lastServiceContent ?? {
        notificationId: 92901,
        taskOngoing: true,
        taskTitle: this.environment.translate('notifications.android.runningTitle'),
        taskDesc: this.environment.translate('notifications.android.preparing'),
      }
    );
  }

  private serviceContent(record: ActivityRecord): ServiceContent {
    return {
      notificationId: record.id,
      taskOngoing: !isTerminal(record.props.phase),
      taskTitle: record.props.title.slice(0, 120),
      taskDesc: [record.props.detail, record.props.preview]
        .filter(Boolean)
        .join('\n')
        .slice(0, 600),
      linkingURI: record.deepLinkUrl,
    };
  }

  private async settleAnchor(record: ActivityRecord): Promise<void> {
    if (
      this.interrupting ||
      !this.background?.isRunning() ||
      this.lastServiceContent?.notificationId !== record.id
    )
      return;
    const content = this.serviceContent(record);
    if (JSON.stringify(content) === JSON.stringify(this.lastServiceContent)) return;
    try {
      await this.background.updateNotification(content);
      this.lastServiceContent = content;
    } catch (error) {
      logger.warn('Background service update failed', error as Error);
    }
  }

  private async publishNotifications(): Promise<void> {
    for (const record of this.activities) {
      try {
        await this.publishNotification(record);
      } catch (error) {
        logger.warn('Task notification delivery failed', error as Error);
      }
    }
  }

  private async publishNotification(record: ActivityRecord): Promise<void> {
    if (
      this.disposed ||
      record.cancelled ||
      record.latestProps !== record.props ||
      record.lastDelivered === record.props
    )
      return;
    const { props } = record;
    const phase = props.phase;
    const terminal = isTerminal(phase);
    const kind = terminal ? 'terminal' : phase === 'awaiting-approval' ? 'approval' : undefined;
    const requiresAttention = phase === 'awaiting-approval' || phase === 'failed';
    const shouldAlert =
      kind !== undefined &&
      record.attention !== kind &&
      (requiresAttention ||
        (phase === 'completed' && this.environment.isReplyCompletionNotificationEnabled())) &&
      (requiresAttention || record.phaseStartedInBackground) &&
      AppState.currentState === 'background';
    if (
      kind &&
      record.attention !== kind &&
      requiresAttention &&
      AppState.currentState === 'active'
    ) {
      this.environment.onForegroundAttention({
        detail: props.detail,
        phase,
        title: props.title,
        url: record.deepLinkUrl,
      });
    }
    if (kind) record.attention = kind;
    record.lastDelivered = props;
    await this.native?.showBackgroundTaskNotification?.(
      record.id,
      props.title.slice(0, 120),
      [props.detail, props.preview].filter(Boolean).join('\n').slice(0, 600),
      record.deepLinkUrl ?? null,
      !terminal,
      shouldAlert,
      this.environment.translate(
        shouldAlert
          ? 'notifications.android.attentionChannel'
          : 'notifications.android.runningTitle',
      ),
    );
  }

  private armDeadline(): void {
    if (
      Number(Platform.Version) < 35 ||
      !this.background?.isRunning() ||
      AppState.currentState === 'active' ||
      this.deadlineTimer
    )
      return;
    this.backgroundStartedAt ??= Date.now();
    const remaining = BACKGROUND_EXECUTION_LIMIT_MS - (Date.now() - this.backgroundStartedAt);
    this.deadlineTimer = setTimeout(
      () => {
        this.deadlineTimer = undefined;
        void this.interruptAtDeadline().catch((error: unknown) => {
          logger.warn('Background execution deadline cleanup failed', error as Error);
        });
      },
      Math.max(0, remaining),
    );
  }

  private async interruptAtDeadline(): Promise<void> {
    if (this.disposed || AppState.currentState === 'active') return;
    this.backgroundLimitReached = true;
    await this.interruptLeases(new KeepAliveInterruptionError('execution-limit'));
  }

  private async interruptLeases(reason: KeepAliveInterruptionError): Promise<void> {
    if (this.disposed || this.interrupting) return;
    this.clearDeadline();
    this.interrupting = true;
    this.interrupted = true;
    this.publishStatus();
    const leases = [...this.leases];
    this.leases.clear();
    if (leases.length > 0) {
      // Platform budget and service revocations are expected cancellation paths; keep them
      // visible in development diagnostics without sending them to Sentry as errors.
      logger.warn('Background execution interrupted', reason, {
        operation: 'background.execution.interrupt',
        reason: reason.reason,
        appState: AppState.currentState,
        leaseCount: leases.length,
      });
    }
    try {
      for (const result of await Promise.allSettled(
        leases.map((lease) => Promise.resolve().then(() => lease.onInterrupt?.(reason))),
      )) {
        if (result.status === 'rejected')
          logger.warn('Background task interruption failed', result.reason);
      }
    } finally {
      await this.enqueue(async () => {
        this.interrupting = false;
        // Foreground entry may reset the budget and admit new leases while
        // old domain cancellation drains. Keep their existing service alive.
        await this.reconcile();
      });
    }
  }

  private clearDeadline(): void {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = undefined;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.operationTail.then(operation);
    this.operationTail = result.catch(() => {});
    return result;
  }
}

function isTerminal(phase: ActivityProps['phase']): boolean {
  return phase === 'completed' || phase === 'failed' || phase === 'cancelled';
}
