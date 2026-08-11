import { Platform } from 'react-native';

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
  getBackgroundReplyCompactLabel,
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
};

type BackgroundReplyServiceDependencies = {
  activities: {
    startSession: (
      input: Omit<BackgroundActivitySessionInput<BackgroundReplyActivityProps>, 'presenter'>,
    ) => ChatActivitySession;
  };
  preference: {
    readCached: (key: typeof PREFERENCE_KEY) => boolean;
    subscribeChange: (key: typeof PREFERENCE_KEY) => (listener: () => void) => () => void;
  };
  translate: BackgroundReplyTranslate;
};

/**
 * Chat's domain adapter over the background-activity mechanism: it owns the
 * per-topic turn state machine, derives presentable content from chat
 * messages, and maps generating phases onto the session's keepAlive bit.
 * Throttling, AppState handling, orphan sweeps, and keep-alive audio all live
 * behind the injected session manager.
 */
export class BackgroundReplyService implements BackgroundReplyLifecycle {
  private disposed = false;
  private enabled: boolean;
  private generation = 0;
  private operationTail: Promise<void> = Promise.resolve();
  private preferenceUnsubscribe?: () => void;
  private turns = new Map<string, TurnRecord>();

  constructor(private readonly dependencies: BackgroundReplyServiceDependencies) {
    this.enabled = Platform.OS === 'ios' && dependencies.preference.readCached(PREFERENCE_KEY);

    if (Platform.OS !== 'ios') return;

    this.preferenceUnsubscribe = dependencies.preference.subscribeChange(PREFERENCE_KEY)(() => {
      this.handlePreferenceChange();
    });
  }

  startTurn = (input: BackgroundReplyTurnInput): BackgroundReplyTurn => {
    if (Platform.OS !== 'ios' || this.disposed) return noOpTurn;

    const existing = this.turns.get(input.topicId);
    const generation = ++this.generation;
    const content = deriveBackgroundReplyContent(undefined, this.dependencies.translate);
    const record: TurnRecord = {
      assistantName:
        input.assistantName.trim() || this.dependencies.translate('chat.backgroundReply.assistant'),
      content,
      generation,
      startedAtEpochMs: existing?.startedAtEpochMs ?? Date.now(),
      topicId: input.topicId,
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
          const latest = deriveBackgroundReplyContent(message, this.dependencies.translate);
          current.content = {
            detail: this.dependencies.translate('chat.backgroundReply.awaitingApproval'),
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.preferenceUnsubscribe?.();

    const records = [...this.turns.values()];
    this.turns.clear();
    for (const record of records) {
      record.session?.cancel();
      record.session = undefined;
    }
  }

  private handlePreferenceChange(): void {
    this.enabled = this.dependencies.preference.readCached(PREFERENCE_KEY);
    if (!this.enabled) {
      for (const record of this.turns.values()) {
        record.session?.cancel();
        record.session = undefined;
      }
      return;
    }
    for (const record of this.turns.values()) this.ensureSession(record);
  }

  private updateTurn(
    topicId: string,
    generation: number,
    message: Parameters<BackgroundReplyTurn['update']>[0],
  ) {
    if (!this.isCurrent(topicId, generation)) return;
    const record = this.turns.get(topicId);
    if (!record) return;

    const nextContent = deriveBackgroundReplyContent(message, this.dependencies.translate);
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
      this.dependencies.translate,
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
  private ensureSession(record: TurnRecord): void {
    if (!this.enabled || this.disposed) return;

    const keepAlive = isGeneratingPhase(record.content.phase);
    if (record.session) {
      record.session.update(this.toActivityProps(record), { keepAlive, urgent: true });
      return;
    }
    record.session = this.dependencies.activities.startSession({
      deepLinkUrl: `cherrystudio://topics?topicId=${encodeURIComponent(record.topicId)}`,
      keepAlive,
      props: this.toActivityProps(record),
      tag: SESSION_TAG,
    });
  }

  private toActivityProps(record: TurnRecord): BackgroundReplyActivityProps {
    return {
      ...record.content,
      assistantName: record.assistantName,
      compactLabel: getBackgroundReplyCompactLabel(
        record.content.phase,
        this.dependencies.translate,
      ),
      startedAtEpochMs: record.startedAtEpochMs,
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
