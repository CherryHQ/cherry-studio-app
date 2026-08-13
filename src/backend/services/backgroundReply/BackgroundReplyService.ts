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
import type { BackgroundActivityEnvironment } from '@/backend/services/backgroundActivities/BackgroundActivityEnvironment';
import type {
  BackgroundActivitySession,
  BackgroundActivitySessionInput,
} from '@/backend/services/backgroundActivities/BackgroundActivityManager';
import type {
  BackgroundReplyActivityProps,
  BackgroundReplyContent,
  BackgroundReplyPhase,
} from '@/shared/backgroundActivities/chatReply';
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
const logger = loggerService.withContext('BackgroundReply');

type ChatActivitySession = BackgroundActivitySession<BackgroundReplyActivityProps>;

type TurnRecord = {
  assistantName: string;
  content: BackgroundReplyContent;
  generation: number;
  session?: ChatActivitySession;
  startedAtEpochMs: number;
  topicId: string;
  topicTitle: string;
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
 * per-topic turn state machine, derives presentable content from chat
 * messages, and maps generating phases onto the session's keepAlive bit.
 * Throttling, AppState handling, orphan sweeps, and keep-alive audio all live
 * behind the injected session manager.
 */
@Injectable('BackgroundReplyService')
@ServicePhase(Phase.PostReady)
@DependsOn(['BackgroundActivityManager', 'PreferenceService', 'BackgroundActivityEnvironment'])
@AppStatePolicy('background-presentation')
export class BackgroundReplyService
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

    const existing = this.turns.get(input.topicId);
    const generation = ++this.generation;
    const content = deriveBackgroundReplyContent(undefined, this.environment.translate);
    const assistantName =
      input.assistantName.trim() || this.environment.translate('chat.backgroundReply.assistant');
    const record: TurnRecord = {
      assistantName,
      content,
      generation,
      startedAtEpochMs: existing?.startedAtEpochMs ?? Date.now(),
      topicId: input.topicId,
      topicTitle: input.topicTitle.trim(),
      ...(existing?.session ? { session: existing.session } : {}),
    };
    this.turns.set(input.topicId, record);
    this.ensureSession(record);

    return {
      ready: record.session?.ready ?? Promise.resolve(),
      awaitApproval: (message) =>
        this.runTurnCallback(input.topicId, 'mark approval pending', () => {
          if (!this.isCurrent(input.topicId, generation)) return;
          const current = this.turns.get(input.topicId);
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
      finish: (outcome) =>
        this.runTurnCallback(input.topicId, 'finish turn', () => {
          this.finishTurn(input.topicId, generation, outcome);
        }),
      update: (message) =>
        this.runTurnCallback(input.topicId, 'update turn', () => {
          this.updateTurn(input.topicId, generation, message);
        }),
    };
  };

  clearTopic = (topicId: string): void => {
    const record = this.turns.get(topicId);
    if (!record) return;

    this.turns.delete(topicId);
    record.session?.cancel();
    record.session = undefined;
  };

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
    topicId: string,
    generation: number,
    message: Parameters<BackgroundReplyTurn['update']>[0],
  ) {
    if (!this.isCurrent(topicId, generation)) return;
    const record = this.turns.get(topicId);
    if (!record) return;

    const nextContent = deriveBackgroundReplyContent(message, this.environment.translate);
    const phaseChanged = nextContent.phase !== record.content.phase;
    record.content = nextContent;
    record.session?.update(this.toActivityProps(record), {
      keepAlive: isGeneratingPhase(nextContent.phase),
      urgent: phaseChanged,
    });
  }

  private finishTurn(topicId: string, generation: number, outcome: BackgroundReplyOutcome): void {
    if (!this.isCurrent(topicId, generation)) return;
    const record = this.turns.get(topicId);
    if (!record) return;

    record.content = getTerminalBackgroundReplyContent(
      outcome,
      record.content.preview,
      this.environment.translate,
    );
    // Deferred so a continuation turn started in the same tick (approval
    // resume, regenerate) inherits the live session instead of watching it
    // end and restart.
    void this.enqueue(async () => {
      if (!this.isRecordCurrent(record)) return;
      record.session?.finish(this.toActivityProps(record));
      record.session = undefined;
      if (this.turns.get(topicId) === record) this.turns.delete(topicId);
    });
  }

  /** Starts the topic's session, or re-syncs an inherited one, when enabled. */
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
      deepLinkUrl: `cherrystudio://topics?topicId=${encodeURIComponent(record.topicId)}`,
      keepAlive,
      presenter: this.environment.assistantPresenter,
      props: this.toActivityProps(record),
      tag: SESSION_TAG,
    });
  }

  private toActivityProps(record: TurnRecord): BackgroundReplyActivityProps {
    return {
      ...record.content,
      ...(record.topicTitle ? { attribution: record.assistantName } : {}),
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
      title: record.topicTitle || record.assistantName,
    };
  }

  private isCurrent(topicId: string, generation: number): boolean {
    return !this.disposed && this.turns.get(topicId)?.generation === generation;
  }

  private isRecordCurrent(record: TurnRecord): boolean {
    return !this.disposed && this.turns.get(record.topicId) === record;
  }

  private runTurnCallback(topicId: string, operation: string, callback: () => void): void {
    try {
      callback();
    } catch (error) {
      logger.error(`Background reply failed to ${operation}`, error as Error, { topicId });
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const run = this.operationTail.then(operation, operation);
    this.operationTail = run.catch(() => {});
    return run;
  }
}

const noOpTurn: BackgroundReplyTurn = {
  ready: Promise.resolve(),
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
