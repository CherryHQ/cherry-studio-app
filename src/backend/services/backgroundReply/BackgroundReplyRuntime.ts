import type { BackgroundActivityIcon } from '@cherrystudio/ui/background-activity';
import { resolveScheme } from 'expo-linking';
import { AppState } from 'react-native';

import {
  type Activatable,
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { BackgroundActivityEnvironment } from '@/backend/services/backgroundActivity/BackgroundActivityEnvironment';
import type {
  BackgroundActivitySession,
  BackgroundActivitySessionInput,
} from '@/backend/services/backgroundActivity/BackgroundActivityManager';
import type {
  KeepAliveLease,
  KeepAliveSource,
} from '@/backend/services/keepAlive/KeepAliveCoordinator';
import type {
  BackgroundReplyActivityProps,
  BackgroundReplyContent,
  BackgroundReplyPhase,
} from '@/shared/backgroundActivity/chatReply';
import { createBackgroundTaskUrl } from '@/shared/backgroundActivity/taskLink';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type {
  BackgroundReplyLifecycle,
  BackgroundReplyMessage,
  BackgroundReplyOutcome,
  BackgroundReplyTurn,
  BackgroundReplyTurnInput,
  BackgroundReplyUpdateOptions,
} from './backgroundReplyTypes';
import {
  type BackgroundReplyTranslate,
  deriveBackgroundReplyContent,
  getTerminalBackgroundReplyContent,
} from './deriveBackgroundReplyContent';
import type { ReplyCompletionNotifier } from './replyCompletionNotifications';

const ACTIVITY_PREFERENCE_KEY = 'chat.background_reply.enabled';
const NOTIFICATION_PREFERENCE_KEY = 'chat.completion_notifications.enabled';
const SESSION_TAG = 'chat.backgroundReply';
const FINISH_TITLE_GRACE_MS = 5_000;
const PREVIEW_UPDATE_INTERVAL_MS = 1_000;
const logger = loggerService.withContext('BackgroundReply');

type ChatActivitySession = BackgroundActivitySession<BackgroundReplyActivityProps>;

type TurnRecord = {
  actorName: string;
  content: BackgroundReplyContent;
  conversationTitle: string;
  deepLinkUrl: string;
  generation: number;
  key: string;
  latestMessage?: BackgroundReplyMessage;
  onInterrupt?: (reason: Error) => void | Promise<void>;
  session?: ChatActivitySession;
  startedAtEpochMs: number;
  updateTimer?: ReturnType<typeof setTimeout>;
};

type BackgroundActivityPort = {
  dismissTask(deepLinkUrl: string): void;
  startSession<Props extends BackgroundReplyActivityProps>(
    input: BackgroundActivitySessionInput<Props>,
  ): BackgroundActivitySession<Props>;
};

type RuntimePreferenceKey = typeof ACTIVITY_PREFERENCE_KEY | typeof NOTIFICATION_PREFERENCE_KEY;

type PreferencePort = {
  readCached(key: RuntimePreferenceKey): boolean;
  subscribeChange(key: RuntimePreferenceKey): (listener: () => void) => () => void;
};

type EnvironmentPort = {
  assistantPresenter: BackgroundActivityEnvironment['assistantPresenter'];
  /** Optional iOS completion-notice channel; absent means no delivery. */
  replyNotifications?: ReplyCompletionNotifier;
  translate: BackgroundReplyTranslate;
};

/**
 * Chat's domain adapter over the background-activity mechanism: it owns the
 * per-session turn state machine, derives presentable content from chat
 * messages, and maps generating phases onto the session's keepAlive bit.
 * Throttling, AppState handling, orphan sweeps, and platform keep-alive all live
 * behind the injected session manager. Platform availability is a presenter
 * and lease-source concern; this runtime never branches on it.
 */
@Injectable('BackgroundReplyRuntime')
@ServicePhase(Phase.PostReady)
@DependsOn([
  'BackgroundActivityManager',
  'PreferenceService',
  'BackgroundActivityEnvironment',
  'KeepAliveCoordinator',
])
@AppStatePolicy('background-presentation')
export class BackgroundReplyRuntime
  extends BaseService
  implements Activatable, BackgroundReplyLifecycle
{
  private disposed = false;
  private generation = 0;
  private operationTail: Promise<void> = Promise.resolve();
  private readonly preparationLeases = new Set<KeepAliveLease>();
  private turns = new Map<string, TurnRecord>();

  constructor(
    private readonly activities: BackgroundActivityPort,
    private readonly preference: PreferencePort,
    private readonly environment: EnvironmentPort,
    private readonly keepAlive: KeepAliveSource,
  ) {
    super();
  }

  protected onInit(): void {
    // Both switches drive this runtime: the Live Activities switch controls
    // the surfaces, the completion-notifications switch keeps the logical
    // turn tracking — and with it the notice channel — alive on its own,
    // wherever an independent notifier actually exists.
    this.registerDisposable(
      this.preference.subscribeChange(ACTIVITY_PREFERENCE_KEY)(() => this.handlePreferenceChange()),
    );
    this.registerDisposable(
      this.preference.subscribeChange(NOTIFICATION_PREFERENCE_KEY)(() =>
        this.handlePreferenceChange(),
      ),
    );
  }

  protected async onReady(): Promise<void> {
    if (this.shouldRun()) await this.activate();
  }

  onActivate(): void {
    this.presentSurfaces();
  }

  onDeactivate(): void {
    this.cancelSessions();
  }

  /** Surfaces exist only while the Live Activities switch is on. */
  private presentSurfaces(): void {
    if (!this.preference.readCached(ACTIVITY_PREFERENCE_KEY)) return;
    try {
      for (const record of this.turns.values()) {
        this.refreshContent(record);
        this.ensureSession(record, true);
      }
    } catch (error) {
      this.cancelSessions();
      throw error;
    }
  }

  private shouldRun(): boolean {
    // The completion switch keeps this runtime alive only where an independent
    // notifier exists (iOS). Elsewhere it must not resurrect chat execution
    // that the background-replies switch turned off.
    return (
      this.preference.readCached(ACTIVITY_PREFERENCE_KEY) ||
      (this.preference.readCached(NOTIFICATION_PREFERENCE_KEY) &&
        this.environment.replyNotifications !== undefined)
    );
  }

  private cancelSessions(): void {
    for (const lease of this.preparationLeases) lease.release();
    this.preparationLeases.clear();
    for (const record of this.turns.values()) {
      this.clearUpdateTimer(record);
      record.session?.cancel();
      record.session = undefined;
    }
  }

  acquirePreparation = (
    sessionId: string,
    onInterrupt: (reason: Error) => void,
  ): KeepAliveLease => {
    if (!this.isActivated || this.disposed) return { release() {} };
    const lease = this.keepAlive.acquire('chat.preparation', onInterrupt);
    this.preparationLeases.add(lease);
    const prepared = this.prepareTurn(sessionId);
    return {
      release: () => {
        if (this.preparationLeases.delete(lease)) lease.release();
        // A turn that started owns the record now. Nothing took it over means
        // preparation ended without one, so its surface has nothing to say.
        if (prepared && this.turns.get(sessionId) === prepared) this.clearTurn(sessionId);
      },
    };
  };

  /**
   * Opens the Session's surface for the preparation stage. A surface can only
   * be created while the user can still see the app, and preparation is the
   * part of a submission they are most likely to walk away from.
   */
  private prepareTurn(sessionId: string): TurnRecord | undefined {
    if (this.turns.has(sessionId)) return undefined;
    const record: TurnRecord = {
      // The turn replaces both labels as soon as it knows them.
      actorName: this.environment.translate('chat.backgroundReply.assistant'),
      content: deriveBackgroundReplyContent(undefined, this.environment.translate),
      conversationTitle: '',
      deepLinkUrl: sessionTaskUrl(sessionId),
      generation: ++this.generation,
      key: sessionId,
      startedAtEpochMs: Date.now(),
    };
    this.turns.set(sessionId, record);
    this.beginReplyDestination(record);
    this.ensureSession(record);
    return record;
  }

  startTurn = (input: BackgroundReplyTurnInput): BackgroundReplyTurn => {
    if (!this.isActivated || this.disposed) return noOpTurn;

    const normalized = normalizeTurnInput(input);
    const existing = this.turns.get(normalized.key);
    if (existing) this.clearUpdateTimer(existing);
    const generation = ++this.generation;
    const content = deriveBackgroundReplyContent(undefined, this.environment.translate);
    const actorName =
      normalized.actorName.trim() || this.environment.translate('chat.backgroundReply.assistant');
    const record: TurnRecord = {
      actorName,
      content,
      conversationTitle: normalized.conversationTitle.trim(),
      deepLinkUrl: normalized.deepLinkUrl,
      generation,
      key: normalized.key,
      onInterrupt: input.onInterrupt,
      startedAtEpochMs: existing?.startedAtEpochMs ?? Date.now(),
      ...(existing?.session ? { session: existing.session } : {}),
    };
    this.turns.set(record.key, record);
    this.beginReplyDestination(record);
    this.ensureSession(record);

    return {
      awaitApproval: (message) =>
        this.runTurnCallback(record.key, 'mark approval pending', () => {
          if (!this.isCurrent(record.key, generation)) return;
          const current = this.turns.get(record.key);
          if (!current) return;
          if (message) current.latestMessage = message;
          this.clearUpdateTimer(current);
          const latest = current.latestMessage
            ? deriveBackgroundReplyContent(current.latestMessage, this.environment.translate)
            : current.content;
          current.content = {
            detail: this.environment.translate('chat.backgroundReply.awaitingApproval'),
            phase: 'awaiting-approval',
            ...(latest.preview ? { preview: latest.preview } : {}),
          };
          current.session?.update(this.toActivityProps(current), {
            keepAlive: false,
            urgent: true,
          });
        }),
      finish: (outcome, options) => {
        void this.finishTurn(record.key, generation, outcome, options?.waitFor).catch(
          (error: unknown) => {
            logger.error('Background reply failed to finish turn', error as Error, {
              key: record.key,
            });
          },
        );
      },
      update: (message, options) =>
        this.runTurnCallback(record.key, 'update turn', () => {
          this.updateTurn(record.key, generation, message, options);
        }),
    };
  };

  clearSession = (sessionId: string): void => {
    this.clearTurn(sessionId);
  };

  updateSessionTitle = (sessionId: string, title: string): void => {
    this.runTurnCallback(sessionId, 'update Agent Session title', () => {
      const record = this.turns.get(sessionId);
      if (!record) return;
      record.conversationTitle = title.trim();
      record.session?.update(this.toActivityProps(record), {
        keepAlive: isGeneratingPhase(record.content.phase),
        urgent: true,
      });
    });
  };

  private clearTurn(key: string): void {
    const deepLinkUrl = sessionTaskUrl(key);
    // A settled surface outlives its turn: a deleted Session must not leave one.
    this.activities.dismissTask(deepLinkUrl);
    // A delivered completion notice is retired with its destination.
    this.environment.replyNotifications?.dismissDestination(deepLinkUrl);
    const record = this.turns.get(key);
    if (!record) return;

    this.turns.delete(key);
    this.clearUpdateTimer(record);
    record.session?.cancel();
    record.session = undefined;
  }

  protected async onStop(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    this.cancelSessions();
    this.turns.clear();
    await this.operationTail;
  }

  private handlePreferenceChange(): void {
    // Live Activities going off drops only the surfaces (the manager retires
    // them through its own presentation subscription); the session, its lease,
    // and the turn tracking keep running while a switch still needs them.
    const wasActivated = this.isActivated;
    const transition = this.shouldRun() ? this.activate() : this.deactivate();
    void transition
      .then((activated) => {
        // activate() is idempotent, so a notify-only run whose Live Activities
        // switch came back on re-presents its surfaces here.
        if (activated && wasActivated) this.presentSurfaces();
      })
      .catch((error: unknown) => {
        logger.error('Background reply preference transition failed', error as Error);
      });
  }

  private updateTurn(
    key: string,
    generation: number,
    message: BackgroundReplyMessage,
    options: BackgroundReplyUpdateOptions | undefined,
  ) {
    if (!this.isCurrent(key, generation)) return;
    const record = this.turns.get(key);
    if (!record) return;

    record.latestMessage = message;
    if (!this.isActivated) return;

    if (options?.deferPreview) {
      if (record.content.phase === 'thinking' && !hasReplyText(message)) {
        return;
      }
      if (record.content.phase === 'responding' || record.content.phase === 'using-tool') {
        this.scheduleContentUpdate(record, generation);
        return;
      }
    }

    this.clearUpdateTimer(record);
    this.refreshContent(record);
  }

  private refreshContent(record: TurnRecord): void {
    if (!record.latestMessage) return;

    const nextContent = deriveBackgroundReplyContent(
      record.latestMessage,
      this.environment.translate,
    );
    const phaseChanged = nextContent.phase !== record.content.phase;
    record.content = nextContent;
    record.session?.update(this.toActivityProps(record), {
      keepAlive: isGeneratingPhase(nextContent.phase),
      urgent: phaseChanged,
    });
  }

  private scheduleContentUpdate(record: TurnRecord, generation: number): void {
    if (record.updateTimer !== undefined) return;

    record.updateTimer = setTimeout(() => {
      record.updateTimer = undefined;
      if (!this.isActivated || !this.isCurrent(record.key, generation)) return;
      this.runTurnCallback(record.key, 'update deferred preview', () => {
        this.refreshContent(record);
      });
    }, PREVIEW_UPDATE_INTERVAL_MS);
  }

  private clearUpdateTimer(record: TurnRecord): void {
    if (record.updateTimer === undefined) return;
    clearTimeout(record.updateTimer);
    record.updateTimer = undefined;
  }

  private async finishTurn(
    key: string,
    generation: number,
    outcome: BackgroundReplyOutcome,
    waitFor?: Promise<unknown>,
  ): Promise<void> {
    if (!this.isCurrent(key, generation)) return;
    const record = this.turns.get(key);
    if (!record) return;

    // Captured at the logical terminal moment, before any finish grace waits.
    const occurredInBackground = AppState.currentState === 'background';
    const hasDeferredPreview = record.updateTimer !== undefined;
    this.clearUpdateTimer(record);
    const preview =
      outcome === 'completed' && hasDeferredPreview && record.latestMessage
        ? deriveBackgroundReplyContent(record.latestMessage, this.environment.translate).preview
        : record.content.preview;
    record.content = getTerminalBackgroundReplyContent(
      outcome,
      preview,
      this.environment.translate,
    );
    // The notice and the final delivery must outlive the session's own lease
    // (dropped by the keepAlive:false update below): hold a short delivery
    // lease until both settle, or a backgrounded app can be suspended
    // mid-submission. With neither channel left there is nothing to protect.
    const deliveryLease =
      record.session || this.environment.replyNotifications
        ? this.keepAlive.acquire('chat.replyNotice')
        : undefined;
    try {
      record.session?.update(this.toActivityProps(record), { keepAlive: false, urgent: true });
      if (waitFor) {
        await this.waitForFinishDependency(key, waitFor);
      }
      // Keep terminal content updateable until any final title projection settles.
      // A continuation that supersedes this generation inherits the live session.
      await this.enqueue(async () => {
        if (!this.isRecordCurrent(record)) return;
        const session = record.session;
        record.session = undefined;
        const notified = await this.notifyReplyFinished(record, outcome, occurredInBackground);
        await session?.finish(this.toActivityProps(record));
        // A delivered notice replaces the Live Activity card as the completion
        // artifact; retire the settled surface so the lock screen shows one item.
        if (notified) this.activities.dismissTask(record.deepLinkUrl);
        if (this.turns.get(key) === record) this.turns.delete(key);
      });
    } finally {
      deliveryLease?.release();
    }
  }

  /** A new reply on a destination retires its previous completion notice; the
   *  iOS permission prompt follows the user action that started the reply. */
  private beginReplyDestination(record: TurnRecord): void {
    const notifications = this.environment.replyNotifications;
    notifications?.dismissDestination(record.deepLinkUrl);
    notifications?.requestPermissionOnce();
  }

  private async notifyReplyFinished(
    record: TurnRecord,
    outcome: BackgroundReplyOutcome,
    occurredInBackground: boolean,
  ): Promise<boolean> {
    const notify = this.environment.replyNotifications?.notifyTurnFinished;
    if (!notify) return false;
    try {
      return await notify({
        deepLinkUrl: record.deepLinkUrl,
        detail: record.content.detail,
        occurredInBackground,
        outcome,
        ...(record.content.preview ? { preview: record.content.preview } : {}),
        title: record.conversationTitle || record.actorName,
      });
    } catch (error) {
      // A delivery failure must never break the turn's own settlement.
      logger.warn('Reply completion notification failed', error as Error, { key: record.key });
      return false;
    }
  }

  private async waitForFinishDependency(key: string, dependency: Promise<unknown>): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const settled = dependency.then(
      () => undefined,
      (error: unknown) => {
        logger.warn('Background reply finish dependency failed', error as Error, { key });
      },
    );
    const graceExpired = new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        timeout = undefined;
        logger.warn('Background reply finish dependency timed out', {
          graceMs: FINISH_TITLE_GRACE_MS,
          key,
        });
        resolve();
      }, FINISH_TITLE_GRACE_MS);
    });

    await Promise.race([settled, graceExpired]);
    if (timeout !== undefined) clearTimeout(timeout);
  }

  /**
   * Starts the conversation's activity, or re-syncs an inherited one, whenever
   * the runtime is active. The session exists even with Live Activities off:
   * its keep-alive bit is the generation's execution lease, and the manager —
   * not this runtime — decides whether a surface presents it.
   */
  private ensureSession(record: TurnRecord, activating = false): void {
    // `onActivate` runs before BaseService flips `isActivated`; callers during
    // normal operation use the public state as the preference gate.
    if ((!activating && !this.isActivated) || this.disposed) return;

    const keepAlive = isGeneratingPhase(record.content.phase);
    if (record.session) {
      record.session.update(this.toActivityProps(record), { keepAlive, urgent: true });
      return;
    }
    record.session = this.activities.startSession({
      deepLinkUrl: record.deepLinkUrl,
      keepAlive,
      onInterrupt: (reason) => this.turns.get(record.key)?.onInterrupt?.(reason),
      presenter: this.environment.assistantPresenter,
      props: this.toActivityProps(record),
      tag: SESSION_TAG,
    });
  }

  private toActivityProps(record: TurnRecord): BackgroundReplyActivityProps {
    return {
      ...record.content,
      ...(record.conversationTitle ? { attribution: record.actorName } : {}),
      compactIcon: 'bubble-ellipsis',
      ...(record.content.phase === 'awaiting-approval'
        ? { compactLabel: this.environment.translate('backgroundActivity.awaitingApproval') }
        : record.content.phase === 'completed'
          ? { compactLabel: this.environment.translate('backgroundActivity.completed') }
          : record.content.phase === 'cancelled'
            ? { compactLabel: this.environment.translate('backgroundActivity.cancelled') }
            : record.content.phase === 'failed'
              ? { compactLabel: record.content.detail }
              : {}),
      detail: record.content.detail,
      icon: backgroundReplyIcon(record.content.phase),
      startedAtEpochMs: record.startedAtEpochMs,
      title: record.conversationTitle || record.actorName,
    };
  }

  private isCurrent(key: string, generation: number): boolean {
    return !this.disposed && this.turns.get(key)?.generation === generation;
  }

  private isRecordCurrent(record: TurnRecord): boolean {
    return !this.disposed && this.turns.get(record.key) === record;
  }

  private runTurnCallback(key: string, operation: string, callback: () => void): void {
    try {
      callback();
    } catch (error) {
      logger.error(`Background reply failed to ${operation}`, error as Error, { key });
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const run = this.operationTail.then(operation, operation);
    this.operationTail = run.catch(() => {});
    return run;
  }
}

function normalizeTurnInput(input: BackgroundReplyTurnInput): {
  actorName: string;
  conversationTitle: string;
  deepLinkUrl: string;
  key: string;
} {
  return {
    actorName: input.agentName,
    conversationTitle: input.sessionTitle,
    deepLinkUrl: sessionTaskUrl(input.sessionId),
    key: input.sessionId,
  };
}

function sessionTaskUrl(sessionId: string): string {
  return createBackgroundTaskUrl(resolveScheme({}), { kind: 'chat', sessionId });
}

const noOpTurn: BackgroundReplyTurn = {
  awaitApproval: () => {},
  finish: () => {},
  update: () => {},
};

function isGeneratingPhase(phase: BackgroundReplyPhase): boolean {
  return (
    phase === 'preparing' ||
    phase === 'thinking' ||
    phase === 'using-tool' ||
    phase === 'responding'
  );
}

function hasReplyText(message: BackgroundReplyMessage): boolean {
  return message.parts.some((part) => part.type === 'text' && part.text.length > 0);
}

function backgroundReplyIcon(phase: BackgroundReplyPhase): BackgroundActivityIcon {
  switch (phase) {
    case 'awaiting-approval':
      return 'bubble-exclamation';
    case 'cancelled':
      return 'x-circle';
    case 'completed':
      return 'check-circle';
    case 'failed':
      return 'warning-triangle';
    case 'preparing':
      return 'hourglass';
    case 'responding':
      return 'bubble-ellipsis';
    case 'thinking':
      return 'brain';
    case 'using-tool':
      return 'wrench';
  }
}
