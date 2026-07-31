import { Asset } from 'expo-asset';
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File } from 'expo-file-system';
import { type LiveActivity, widgetsDirectory } from 'expo-widgets';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { loggerService } from '@/shared/core/logger/LoggerService';

import AssistantActivity from './AssistantActivity';
import type {
  BackgroundReplyActivityProps,
  BackgroundReplyContent,
  BackgroundReplyLifecycle,
  BackgroundReplyOutcome,
  BackgroundReplyPhase,
  BackgroundReplyTurn,
  BackgroundReplyTurnInput,
} from './backgroundReplyTypes';
import {
  type BackgroundReplyTranslate,
  deriveBackgroundReplyContent,
  getBackgroundReplyCompactLabel,
  getTerminalBackgroundReplyContent,
} from './deriveBackgroundReplyContent';

const KEEP_ALIVE_VOLUME = 0.001;
const LIVE_ACTIVITY_UPDATE_INTERVAL_MS = 1000;
const PREFERENCE_KEY = 'chat.background_reply.enabled';
const logger = loggerService.withContext('BackgroundReply');

type TurnRecord = {
  activity?: LiveActivity<BackgroundReplyActivityProps>;
  assistantName: string;
  content: BackgroundReplyContent;
  generation: number;
  lastActivityUpdateAt: number;
  startedAtEpochMs: number;
  topicId: string;
  updateTimer?: ReturnType<typeof setTimeout>;
};

type BackgroundReplyServiceDependencies = {
  preference: {
    getCachedValue: (key: typeof PREFERENCE_KEY) => boolean | undefined;
    subscribeChange: (key: typeof PREFERENCE_KEY) => (listener: () => void) => () => void;
  };
  translate: BackgroundReplyTranslate;
};

export class BackgroundReplyService implements BackgroundReplyLifecycle {
  private appState: AppStateStatus = AppState.currentState;
  private appStateSubscription?: ReturnType<typeof AppState.addEventListener>;
  private disposed = false;
  private enabled: boolean;
  private generation = 0;
  private logoUri?: string;
  private operationTail: Promise<void> = Promise.resolve();
  private player?: AudioPlayer;
  private preferenceUnsubscribe?: () => void;
  private turns = new Map<string, TurnRecord>();

  constructor(private readonly dependencies: BackgroundReplyServiceDependencies) {
    this.enabled =
      Platform.OS === 'ios' && dependencies.preference.getCachedValue(PREFERENCE_KEY) !== false;

    if (Platform.OS !== 'ios') return;

    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
    this.preferenceUnsubscribe = dependencies.preference.subscribeChange(PREFERENCE_KEY)(() => {
      this.handlePreferenceChange();
    });
    void this.enqueue(async () => {
      await this.clearOrphanedActivities();
      await this.prepareLogo();
    });
  }

  startTurn = (input: BackgroundReplyTurnInput): BackgroundReplyTurn => {
    if (Platform.OS !== 'ios' || this.disposed) return noOpTurn;

    const existing = this.turns.get(input.topicId);
    if (existing?.updateTimer) clearTimeout(existing.updateTimer);

    const generation = ++this.generation;
    const content = deriveBackgroundReplyContent(undefined, this.dependencies.translate);
    const record: TurnRecord = {
      assistantName:
        input.assistantName.trim() || this.dependencies.translate('chat.backgroundReply.assistant'),
      content,
      generation,
      lastActivityUpdateAt: existing?.lastActivityUpdateAt ?? 0,
      startedAtEpochMs: existing?.startedAtEpochMs ?? Date.now(),
      topicId: input.topicId,
      ...(existing?.activity ? { activity: existing.activity } : {}),
    };
    this.turns.set(input.topicId, record);

    const ready = this.enqueue(async () => {
      await this.reconcileAudio();
      await this.reconcileActivity(record, true);
    });

    return {
      ready,
      awaitApproval: (message) => {
        if (!this.isCurrent(input.topicId, generation)) return;
        const current = this.turns.get(input.topicId);
        if (!current) return;
        const latest = deriveBackgroundReplyContent(message, this.dependencies.translate);
        current.content = {
          detail: this.dependencies.translate('chat.backgroundReply.awaitingApproval'),
          phase: 'awaiting-approval',
          ...(latest.preview ? { preview: latest.preview } : {}),
        };
        this.clearUpdateTimer(current);
        void this.enqueue(async () => {
          await this.reconcileAudio();
          await this.reconcileActivity(current, true);
        });
      },
      finish: (outcome) => this.finishTurn(input.topicId, generation, outcome),
      update: (message) => this.updateTurn(input.topicId, generation, message),
    };
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.appStateSubscription?.remove();
    this.preferenceUnsubscribe?.();

    const records = [...this.turns.values()];
    this.turns.clear();
    for (const record of records) this.clearUpdateTimer(record);

    void this.enqueue(async () => {
      await Promise.all(records.map((record) => this.endActivity(record, 'immediate')));
      await this.stopAudio();
    });
  }

  private readonly handleAppStateChange = (nextState: AppStateStatus) => {
    this.appState = nextState;
    void this.enqueue(async () => {
      if (nextState === 'active') {
        await Promise.all(
          [...this.turns.values()].map((record) => this.endActivity(record, 'immediate')),
        );
        return;
      }

      await Promise.all(
        [...this.turns.values()].map((record) => this.reconcileActivity(record, true)),
      );
    });
  };

  private handlePreferenceChange(): void {
    this.enabled = this.dependencies.preference.getCachedValue(PREFERENCE_KEY) !== false;
    void this.enqueue(async () => {
      if (!this.enabled) {
        await Promise.all(
          [...this.turns.values()].map((record) => this.endActivity(record, 'immediate')),
        );
      }
      await this.reconcileAudio();
      if (this.enabled && this.appState !== 'active') {
        await Promise.all(
          [...this.turns.values()].map((record) => this.reconcileActivity(record, true)),
        );
      }
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

    const nextContent = deriveBackgroundReplyContent(message, this.dependencies.translate);
    const phaseChanged = nextContent.phase !== record.content.phase;
    const previewChanged = nextContent.preview !== record.content.preview;
    const detailChanged = nextContent.detail !== record.content.detail;
    record.content = nextContent;

    if (this.appState === 'active' || (!phaseChanged && !previewChanged && !detailChanged)) return;

    const elapsed = Date.now() - record.lastActivityUpdateAt;
    if (phaseChanged || elapsed >= LIVE_ACTIVITY_UPDATE_INTERVAL_MS) {
      this.clearUpdateTimer(record);
      void this.enqueue(() => this.reconcileActivity(record, true));
      return;
    }

    if (!record.updateTimer) {
      record.updateTimer = setTimeout(() => {
        record.updateTimer = undefined;
        void this.enqueue(() => this.reconcileActivity(record, true));
      }, LIVE_ACTIVITY_UPDATE_INTERVAL_MS - elapsed);
    }
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
    this.clearUpdateTimer(record);
    void this.enqueue(async () => {
      await this.reconcileAudio();
      if (record.activity) {
        await this.endActivity(record, 'default', Date.now());
      }
      if (this.turns.get(topicId) === record) this.turns.delete(topicId);
    });
  }

  private async reconcileAudio(): Promise<void> {
    const shouldPlay =
      this.enabled &&
      [...this.turns.values()].some((record) => isGeneratingPhase(record.content.phase));
    if (!shouldPlay) {
      await this.stopAudio();
      return;
    }
    if (this.player) return;

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        interruptionMode: 'mixWithOthers',
        playsInSilentMode: true,
        shouldPlayInBackground: true,
      });
      const player = createAudioPlayer(require('../../../../assets/audio/silence.m4a'), {
        updateInterval: LIVE_ACTIVITY_UPDATE_INTERVAL_MS,
      });
      player.loop = true;
      player.volume = KEEP_ALIVE_VOLUME;
      player.play();
      this.player = player;
      logger.info('Background audio started', { activeTurnCount: this.turns.size });
    } catch (error) {
      logger.warn('Background audio failed to start', error as Error, {
        activeTurnCount: this.turns.size,
      });
    }
  }

  private async stopAudio(): Promise<void> {
    const player = this.player;
    if (!player) return;
    this.player = undefined;
    try {
      player.pause();
      player.remove();
      logger.info('Background audio stopped');
    } catch (error) {
      logger.warn('Background audio cleanup failed', error as Error);
    }
  }

  private async reconcileActivity(record: TurnRecord, forceUpdate: boolean): Promise<void> {
    if (!this.enabled || this.appState === 'active' || !this.isRecordCurrent(record)) return;

    const props = this.toActivityProps(record);
    if (!record.activity) {
      try {
        record.activity = AssistantActivity.start(
          props,
          `cherrystudio://topics?topicId=${encodeURIComponent(record.topicId)}`,
        );
        record.lastActivityUpdateAt = Date.now();
        logger.info('Live Activity started', { topicId: record.topicId });
      } catch (error) {
        logger.warn('Live Activity failed to start', error as Error, { topicId: record.topicId });
      }
      return;
    }

    if (!forceUpdate) return;
    try {
      await record.activity.update(props);
      record.lastActivityUpdateAt = Date.now();
    } catch (error) {
      logger.warn('Live Activity update failed', error as Error, { topicId: record.topicId });
    }
  }

  private async endActivity(
    record: TurnRecord,
    policy: 'default' | 'immediate',
    finishedAtEpochMs?: number,
  ): Promise<void> {
    const activity = record.activity;
    if (!activity) return;
    record.activity = undefined;
    try {
      const props = this.toActivityProps(record, finishedAtEpochMs);
      await activity.end(policy, props, new Date());
      logger.info('Live Activity ended', { policy, topicId: record.topicId });
    } catch (error) {
      logger.warn('Live Activity cleanup failed', error as Error, { topicId: record.topicId });
    }
  }

  private toActivityProps(
    record: TurnRecord,
    finishedAtEpochMs?: number,
  ): BackgroundReplyActivityProps {
    return {
      ...record.content,
      assistantName: record.assistantName,
      compactLabel: getBackgroundReplyCompactLabel(
        record.content.phase,
        this.dependencies.translate,
      ),
      startedAtEpochMs: record.startedAtEpochMs,
      ...(finishedAtEpochMs ? { finishedAtEpochMs } : {}),
      ...(this.logoUri ? { logoUri: this.logoUri } : {}),
    };
  }

  private async clearOrphanedActivities(): Promise<void> {
    try {
      const activities = AssistantActivity.getInstances();
      await Promise.all(activities.map((activity) => activity.end('immediate')));
      if (activities.length > 0) {
        logger.info('Cleared orphaned Live Activities', { count: activities.length });
      }
    } catch (error) {
      logger.warn('Orphaned Live Activity cleanup failed', error as Error);
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
      logger.warn('Live Activity logo preparation failed', error as Error);
    }
  }

  private clearUpdateTimer(record: TurnRecord): void {
    if (record.updateTimer) clearTimeout(record.updateTimer);
    record.updateTimer = undefined;
  }

  private isCurrent(topicId: string, generation: number): boolean {
    return !this.disposed && this.turns.get(topicId)?.generation === generation;
  }

  private isRecordCurrent(record: TurnRecord): boolean {
    return !this.disposed && this.turns.get(record.topicId) === record;
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
