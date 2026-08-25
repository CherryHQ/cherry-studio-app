import type { BackgroundActivityIcon } from '@cherrystudio/ui/background-activity';
import { Platform } from 'react-native';

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
  BackgroundReplyActivityProps,
  BackgroundReplyContent,
  BackgroundReplyPhase,
} from '@/shared/backgroundActivity/chatReply';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type {
  BackgroundReplyLifecycle,
  BackgroundReplyOutcome,
  BackgroundReplyTurn,
  BackgroundReplyTurnInput,
} from './backgroundReplyTypes';
import {
  type BackgroundReplyTranslate,
  deriveBackgroundReplyContent,
  getTerminalBackgroundReplyContent,
} from './deriveBackgroundReplyContent';

const PREFERENCE_KEY = 'chat.background_reply.enabled';
const SESSION_TAG = 'chat.backgroundReply';
const FINISH_TITLE_GRACE_MS = 5_000;
const logger = loggerService.withContext('BackgroundReply');

type ChatActivitySession = BackgroundActivitySession<BackgroundReplyActivityProps>;

type TurnRecord = {
  actorName: string;
  content: BackgroundReplyContent;
  conversationTitle: string;
  deepLinkUrl: string;
  generation: number;
  key: string;
  session?: ChatActivitySession;
  startedAtEpochMs: number;
};

type BackgroundActivityPort = {
  startSession<Props extends BackgroundReplyActivityProps>(
    input: BackgroundActivitySessionInput<Props>,
  ): BackgroundActivitySession<Props>;
};

type PreferencePort = {
  readCached(key: typeof PREFERENCE_KEY): boolean;
  subscribeChange(key: typeof PREFERENCE_KEY): (listener: () => void) => () => void;
};

type EnvironmentPort = {
  assistantPresenter: BackgroundActivityEnvironment['assistantPresenter'];
  translate: BackgroundReplyTranslate;
};

/**
 * Chat's domain adapter over the background-activity mechanism: it owns the
 * per-session turn state machine, derives presentable content from chat
 * messages, and maps generating phases onto the session's keepAlive bit.
 * Throttling, AppState handling, orphan sweeps, and keep-alive audio all live
 * behind the injected session manager.
 */
@Injectable('BackgroundReplyRuntime')
@ServicePhase(Phase.PostReady)
@DependsOn(['BackgroundActivityManager', 'PreferenceService', 'BackgroundActivityEnvironment'])
@AppStatePolicy('background-presentation')
export class BackgroundReplyRuntime
  extends BaseService
  implements Activatable, BackgroundReplyLifecycle
{
  private disposed = false;
  private generation = 0;
  private operationTail: Promise<void> = Promise.resolve();
  private turns = new Map<string, TurnRecord>();

  constructor(
    private readonly activities: BackgroundActivityPort,
    private readonly preference: PreferencePort,
    private readonly environment: EnvironmentPort,
  ) {
    super();
  }

  protected onInit(): void {
    if (Platform.OS !== 'ios') return;

    this.registerDisposable(
      this.preference.subscribeChange(PREFERENCE_KEY)(() => this.handlePreferenceChange()),
    );
  }

  protected async onReady(): Promise<void> {
    if (Platform.OS === 'ios' && this.preference.readCached(PREFERENCE_KEY)) {
      await this.activate();
    }
  }

  onActivate(): void {
    try {
      for (const record of this.turns.values()) this.ensureSession(record, true);
    } catch (error) {
      this.cancelSessions();
      throw error;
    }
  }

  onDeactivate(): void {
    this.cancelSessions();
  }

  private cancelSessions(): void {
    for (const record of this.turns.values()) {
      record.session?.cancel();
      record.session = undefined;
    }
  }

  startTurn = (input: BackgroundReplyTurnInput): BackgroundReplyTurn => {
    if (Platform.OS !== 'ios' || this.disposed) return noOpTurn;

    const normalized = normalizeTurnInput(input);
    const existing = this.turns.get(normalized.key);
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
      startedAtEpochMs: existing?.startedAtEpochMs ?? Date.now(),
      ...(existing?.session ? { session: existing.session } : {}),
    };
    this.turns.set(record.key, record);
    this.ensureSession(record);

    return {
      awaitApproval: (message) =>
        this.runTurnCallback(record.key, 'mark approval pending', () => {
          if (!this.isCurrent(record.key, generation)) return;
          const current = this.turns.get(record.key);
          if (!current) return;
          const latest = deriveBackgroundReplyContent(message, this.environment.translate);
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
      update: (message) =>
        this.runTurnCallback(record.key, 'update turn', () => {
          this.updateTurn(record.key, generation, message);
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
    const record = this.turns.get(key);
    if (!record) return;

    this.turns.delete(key);
    record.session?.cancel();
    record.session = undefined;
  }

  protected async onStop(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    const records = [...this.turns.values()];
    this.turns.clear();
    for (const record of records) {
      record.session?.cancel();
      record.session = undefined;
    }
    await this.operationTail;
  }

  private handlePreferenceChange(): void {
    const transition = this.preference.readCached(PREFERENCE_KEY)
      ? this.activate()
      : this.deactivate();
    void transition.catch((error: unknown) => {
      logger.error('Background reply preference transition failed', error as Error);
    });
  }

  private updateTurn(
    key: string,
    generation: number,
    message: Parameters<BackgroundReplyTurn['update']>[0],
  ) {
    if (!this.isCurrent(key, generation)) return;
    const record = this.turns.get(key);
    if (!record) return;

    const nextContent = deriveBackgroundReplyContent(message, this.environment.translate);
    const phaseChanged = nextContent.phase !== record.content.phase;
    record.content = nextContent;
    record.session?.update(this.toActivityProps(record), {
      keepAlive: isGeneratingPhase(nextContent.phase),
      urgent: phaseChanged,
    });
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

    record.content = getTerminalBackgroundReplyContent(
      outcome,
      record.content.preview,
      this.environment.translate,
    );
    record.session?.update(this.toActivityProps(record), { keepAlive: false, urgent: true });
    if (waitFor) {
      await this.waitForFinishDependency(key, waitFor);
    }
    // Keep terminal content updateable until any final title projection settles.
    // A continuation that supersedes this generation inherits the live session.
    await this.enqueue(async () => {
      if (!this.isRecordCurrent(record)) return;
      record.session?.finish(this.toActivityProps(record));
      record.session = undefined;
      if (this.turns.get(key) === record) this.turns.delete(key);
    });
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

  /** Starts the conversation's activity, or re-syncs an inherited one, when enabled. */
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
    deepLinkUrl: `cherrystudio:///?agentId=${encodeURIComponent(input.agentId)}&sessionId=${encodeURIComponent(input.sessionId)}`,
    key: input.sessionId,
  };
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
