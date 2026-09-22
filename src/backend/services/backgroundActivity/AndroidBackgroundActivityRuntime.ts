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
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { BackgroundActivityEnvironment } from './BackgroundActivityEnvironment';
import type { BackgroundActivityPresenter } from './presenter';

const ATTENTION_CHANNEL_ID = 'generation-updates';
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
  id: string;
  latestProps: ActivityProps;
  props: ActivityProps;
};
type LeaseRecord = { onInterrupt?: (reason: Error) => void | Promise<void> };
type Notifications = typeof import('expo-notifications');

/** Business leases and content only; open-source libraries own native execution and delivery. */
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

  constructor(
    private readonly environment: Pick<
      BackgroundActivityEnvironment,
      'isReplyCompletionNotificationEnabled' | 'translate' | 'onForegroundAttention'
    >,
  ) {
    super();
  }

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
    await notifications.setNotificationChannelAsync(ATTENTION_CHANNEL_ID, {
      name: this.environment.translate('notifications.android.attentionChannel'),
      importance: notifications.AndroidImportance.HIGH,
      lockscreenVisibility: notifications.AndroidNotificationVisibility.PRIVATE,
    });
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
    const lease: LeaseRecord = { onInterrupt };
    this.leases.add(lease);
    this.scheduleReconcile();
    return {
      release: () => {
        if (!this.leases.delete(lease)) return;
        // Later work gets its own admission attempt once the unprotected work has ended.
        if (this.leases.size === 0) this.unprotected = false;
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
          id: `cherry-task-${Date.now()}-${this.nextId++}`,
          latestProps: props,
          props,
        };
        if (!this.disposed) this.activities.add(record);
        this.scheduleReconcile();
        return {
          // The posted notification outlives its task record; a focused surface
          // clears it here as well as through App Shell's own acknowledgement.
          dismiss: async () => {
            await this.notifications?.dismissNotificationAsync(record.id);
          },
          update: (nextProps, context) => {
            record.latestProps = nextProps;
            const occurredInBackground =
              context?.phaseStartedInBackground ?? AppState.currentState === 'background';
            return this.enqueue(async () => {
              if (!this.activities.has(record) || this.disposed) return;
              const previousPhase = record.props.phase;
              record.props = nextProps;
              if (record.attention === 'terminal' && !isTerminal(nextProps.phase)) {
                record.attention = undefined;
                await this.notifications?.dismissNotificationAsync(record.id);
              }
              if (previousPhase === 'awaiting-approval' && nextProps.phase !== previousPhase) {
                record.attention = undefined;
                await this.notifications?.dismissNotificationAsync(record.id);
              }
              // Even superseded phases must reset the previous turn's notification state.
              if (record.latestProps !== nextProps) return;
              if (isTerminal(nextProps.phase)) {
                await this.showAttention(record, true, occurredInBackground);
              } else if (nextProps.phase === 'awaiting-approval') {
                await this.showAttention(record, false, occurredInBackground);
              }
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
              record.props = finalProps;
              try {
                if (!record.cancelled) {
                  await this.showAttention(record, true, occurredInBackground);
                } else {
                  await this.notifications?.dismissNotificationAsync(record.id);
                }
              } finally {
                this.activities.delete(record);
                await this.reconcile();
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
    await this.enqueue(async () => {
      await this.stopService();
      await Promise.all(
        [...this.activities].map(({ id }) => this.notifications?.dismissNotificationAsync(id)),
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
            // Native visibility changes promote the same service without restarting its task.
            // The initial strings also name its persistent channel in system settings.
            taskTitle: this.environment.translate('notifications.android.runningTitle'),
            taskDesc: this.environment.translate('notifications.android.preparing'),
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
      await background.updateNotification(content);
      this.armDeadline();
    } finally {
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
    logger.error('Background execution is unprotected', cause as Error, {
      operation: 'background.start',
      appState: AppState.currentState,
      leaseCount: this.leases.size,
    });
  }

  private async stopService(): Promise<void> {
    this.clearDeadline();
    if (this.background?.isRunning()) await this.background.stop();
  }

  private runningContent() {
    const running = [...this.activities].filter(
      ({ props }) => !isTerminal(props.phase) && props.phase !== 'awaiting-approval',
    );
    const first = running[0];
    const multiple = running.length > 1;
    return {
      taskTitle:
        multiple || !first
          ? this.environment.translate('notifications.android.runningTitle')
          : first.props.title.slice(0, 120),
      taskDesc: (multiple
        ? running.map(({ props }) => `${props.title}: ${props.detail}`).join('\n')
        : first
          ? [first.props.detail, first.props.preview].filter(Boolean).join('\n')
          : this.environment.translate('notifications.android.preparing')
      ).slice(0, 600),
      // An aggregate has no single task destination. Restore the app instead
      // of choosing whichever task happened to enter the Set first.
      linkingURI: multiple ? undefined : first?.deepLinkUrl,
    };
  }

  private async showAttention(
    record: ActivityRecord,
    terminal: boolean,
    occurredInBackground: boolean,
  ): Promise<void> {
    const notifications = this.notifications;
    if (!notifications || this.disposed || record.props.phase === 'cancelled') return;
    const kind = terminal ? 'terminal' : 'approval';
    if (record.attention === kind || record.cancelled || record.latestProps !== record.props)
      return;
    const phase = record.props.phase;
    const requiresAttention = phase === 'awaiting-approval' || phase === 'failed';
    // A plain completion follows its own preference; failures and approvals
    // stay attention regardless. Consume the phase so a later preference
    // change or title update never replays it.
    if (phase === 'completed' && !this.environment.isReplyCompletionNotificationEnabled()) {
      record.attention = kind;
      return;
    }
    // Foreground completion stays silent even if delivery runs after background entry.
    if (!occurredInBackground && !requiresAttention) {
      record.attention = kind;
      return;
    }
    const permission =
      AppState.currentState === 'background'
        ? await notifications.getPermissionsAsync()
        : undefined;
    if (this.disposed || record.cancelled || record.latestProps !== record.props) return;
    // Consume this phase before scheduling: failures and later title updates never replay it.
    record.attention = kind;
    if (AppState.currentState !== 'background') {
      if (AppState.currentState === 'active' && requiresAttention) {
        this.environment.onForegroundAttention({
          detail: record.props.detail,
          phase,
          title: record.props.title,
          url: record.deepLinkUrl,
        });
      }
      return;
    }
    if (!permission?.granted) return;
    await notifications.scheduleNotificationAsync({
      identifier: record.id,
      content: {
        title: record.props.title.slice(0, 120),
        body: [record.props.detail, record.props.preview].filter(Boolean).join('\n').slice(0, 600),
        data: { owner: BACKGROUND_NOTIFICATION_OWNER, terminal, url: record.deepLinkUrl },
      },
      trigger: { channelId: ATTENTION_CHANNEL_ID },
    });
  }

  private armDeadline(): void {
    if (!this.background?.isRunning() || AppState.currentState === 'active' || this.deadlineTimer)
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
