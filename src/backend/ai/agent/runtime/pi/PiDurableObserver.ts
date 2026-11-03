import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { CompactionEntry } from '@earendil-works/pi-durable';
import type {
  ConversationView,
  EntryId,
  EntryRecord,
  InboxState,
  JsonObject,
  LiveState,
  SubmissionId,
  SubmissionRecord,
  WatchHandle,
} from '@earendil-works/pi-durable';

import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  laneKey,
  type RuntimeConversationEvent,
  type RuntimeConversationSnapshot,
  type RuntimeLane,
} from '../durableTypes';
import type { RuntimeToolProgress } from '../types';
import { projectPiTurn, readPiSubmission } from './piDurableProjection';
import type { PiDurableRuntime } from './PiDurableRuntime';
import { hasResponseContent } from './piStreamEvents';

type InputView = {
  record: SubmissionRecord;
  metadata: JsonObject | undefined;
  terminalEntries?: readonly EntryRecord[];
};
const logger = loggerService.withContext('PiDurableObserver');

/** A disposable presentation mount. Cherry owns settled history; Pi supplies current execution. */
export class PiDurableObserver {
  private stream: WatchHandle<ConversationView> | undefined;
  private unsubscribeSubmissions: (() => void) | undefined;
  private view: ConversationView | undefined;
  private processing: Promise<void> = Promise.resolve();
  private ready = false;
  private stopped = false;
  private readonly pendingSubmissions = new Map<SubmissionId, SubmissionRecord>();
  private readonly inputs = new Map<SubmissionId, InputView>();
  private readonly entries = new Map<EntryId, EntryRecord>();
  /** Terminal IDs for this mount; a delayed view may still name an already settled input. */
  private readonly settled = new Set<SubmissionId>();
  private newest: EntryId | undefined;
  private live: Readonly<LiveState> = {};
  private retrying = false;
  private readonly toolStates = new Map<string, 'running' | 'input-available' | 'interrupted'>();
  private readonly nestedTools = new Map<
    string,
    { parentCallId: string } & Omit<RuntimeToolProgress['calls'][number], 'id'>
  >();

  constructor(
    private readonly runtime: PiDurableRuntime,
    private readonly lane: RuntimeLane,
    private readonly listener: (event: RuntimeConversationEvent) => void,
  ) {}

  async start(): Promise<RuntimeConversationSnapshot> {
    if (this.unsubscribeSubmissions) throw new Error('The Pi observer is already attached.');
    this.stopped = false;
    // Subscribe first: a whole run, or a queued withdrawal, can happen between view frames.
    this.unsubscribeSubmissions = await this.runtime.observeSubmissions(
      laneKey(this.lane),
      (records) => {
        for (const record of records)
          if (record.type === 'input') this.pendingSubmissions.set(record.id, record);
        if (this.ready && this.pendingSubmissions.size) this.flushSubmissions();
      },
    );
    try {
      const stream = await this.runtime.watch(laneKey(this.lane));
      this.stream = stream;
      await this.advance(stream.value, true);
      const snapshot = this.snapshot();
      this.ready = true;
      stream.start(async (call) => {
        if (call.kind === 'value') await this.enqueue(call.value);
      });
      // The initial read may already see a terminal record. Deliver it after the snapshot too.
      if (
        this.pendingSubmissions.size ||
        [...this.inputs.values()].some(({ record }) => isTerminal(record))
      )
        this.flushSubmissions();
      return snapshot;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.ready = false;
    this.unsubscribeSubmissions?.();
    this.unsubscribeSubmissions = undefined;
    const stream = this.stream;
    this.stream = undefined;
    await stream?.stop();
    await this.processing;
    this.view = undefined;
    this.pendingSubmissions.clear();
    this.inputs.clear();
    this.entries.clear();
    this.settled.clear();
    this.toolStates.clear();
    this.nestedTools.clear();
    this.newest = undefined;
    this.live = {};
    this.retrying = false;
  }

  private flushSubmissions() {
    // Commit observers only buffer synchronously. All Session reads happen on this async queue.
    void this.enqueue().catch((error) => {
      logger.error('Could not project committed Pi inputs', {
        sessionId: this.lane.sessionId,
        slot: this.lane.slot,
        error,
      });
    });
  }

  private enqueue(view?: ConversationView): Promise<void> {
    const pending = this.processing.then(async () => {
      const next = view ?? this.view;
      if (!this.stopped && next) await this.advance(next);
    });
    this.processing = pending.catch(() => {});
    return pending;
  }

  private async advance(view: ConversationView, initial = false) {
    const changes = [...this.pendingSubmissions.values()];
    this.pendingSubmissions.clear();
    try {
      const live = (view.docs['pi.live'] as Readonly<LiveState> | undefined) ?? {};
      const inbox = (view.docs['pi.inbox'] as Readonly<InboxState> | undefined)?.items ?? [];
      const visibleIds = new Set([...(live.run?.inputs ?? []), ...inbox.map((item) => item.id)]);
      const previousContext = this.contextStatus();
      const previousQueue = this.queueKey();
      const records = new Map(changes.map((record) => [record.id, record]));
      const missing = [...new Set([...visibleIds, ...records.keys()])].filter(
        (id) => !this.inputs.has(id) && !this.settled.has(id),
      );
      for (const input of await this.runtime.submissions(missing)) {
        if (input.record.type === 'input') this.inputs.set(input.record.id, input);
      }
      for (const record of records.values()) {
        if (record.type !== 'input' || this.settled.has(record.id)) continue;
        const input = this.inputs.get(record.id);
        // A read can already see a later commit than the one that scheduled this callback.
        if (input && isTerminal(input.record) && !isTerminal(record)) continue;
        this.inputs.set(record.id, {
          record,
          metadata: input?.metadata ?? (await this.runtime.submissionMetadata(record)),
        });
      }

      const through = view.entries.at(-1)?.id ?? view.before;
      const gap =
        view.before !== undefined && (this.newest === undefined || view.before > this.newest);
      for (const entry of view.entries) {
        if (
          !initial &&
          (this.newest === undefined || entry.id > this.newest) &&
          CompactionEntry.is(entry)
        )
          logger.info('Pi durable context compaction', {
            sessionId: this.lane.sessionId,
            slot: this.lane.slot,
            operation: 'pi.compaction',
            entryId: Number(entry.id),
            reasonCode: entry.data?.reason,
            outcome: 'committed',
          });
        this.entries.set(entry.id, entry);
      }
      for (const input of this.inputs.values()) {
        const { record } = input;
        if (record.entry === undefined) continue;
        const terminal = isTerminal(record);
        if (!terminal && !gap && this.entries.has(record.entry)) continue;
        if (!terminal && (through === undefined || through < record.entry)) continue;
        // A terminal result must include the entire turn, even if the watch never showed it.
        const entries = await this.runtime.turnEntries(
          laneKey(this.lane),
          record,
          BACKGROUND_CONTEXT,
          terminal ? undefined : through,
        );
        if (terminal) input.terminalEntries = entries;
        for (const entry of entries) this.entries.set(entry.id, entry);
      }
      if (this.stopped) return;
      const previousRun = this.live.run;
      this.logProgress(live);
      this.retrying =
        live.generation?.retry !== undefined ||
        (this.retrying &&
          live.generation !== undefined &&
          (live.generation.message === undefined ||
            live.generation.message.stopReason === 'error' ||
            !hasResponseContent(live.generation.message)));
      this.live = live;
      this.view = view;
      this.newest = through;
      this.toolStates.clear();
      for (const tool of live.tools ?? []) {
        if (tool.status !== 'done')
          this.toolStates.set(
            tool.callId,
            tool.status === 'running' ? 'running' : 'input-available',
          );
        else if (tool.entry === undefined) this.toolStates.set(tool.callId, 'interrupted');
      }
      this.nestedTools.clear();
      for (const tool of live.nestedTools ?? []) {
        this.nestedTools.set(tool.callId, {
          parentCallId: tool.parentCallId,
          name: tool.name,
          status: tool.summary
            ? tool.summary.isError
              ? 'error'
              : 'ok'
            : tool.status === 'done'
              ? 'interrupted'
              : tool.status,
        });
      }
      if (initial) return;

      if (this.contextStatus() !== previousContext)
        this.listener({ type: 'context.updated', status: this.contextStatus() });
      for (const input of this.inputs.values()) {
        // A placed record can outpace its run frame while the old inbox still names it.
        if (input.record.status === 'placed' && !live.run?.inputs.includes(input.record.id))
          continue;
        if (input.record.status === 'unanswered') {
          const stored = readPiSubmission(input.metadata);
          const taskId = live.runFailure?.inputs.includes(input.record.id)
            ? live.runFailure.taskId
            : [live.run, previousRun].find((run) => run?.inputs.includes(input.record.id))?.taskId;
          logger.error('Pi durable run ended without an answer', {
            sessionId: this.lane.sessionId,
            slot: this.lane.slot,
            operation: 'pi.run',
            ...(taskId !== undefined ? { taskId: Number(taskId) } : {}),
            reasonCode: input.record.reason,
            requestId: stored.requestId,
            turnId: stored.turnId,
            assistantMessageId: stored.assistantMessageId,
          });
        }
        this.listener({ type: 'turn.updated', turn: this.project(input) });
      }
      if (this.queueKey() !== previousQueue)
        this.listener({ type: 'queue.updated', queue: this.snapshot().queue });
      for (const [id, input] of this.inputs)
        if (isTerminal(input.record)) {
          this.settled.add(id);
          this.inputs.delete(id);
        }
      const earliest = Math.min(
        ...[...this.inputs.values()].flatMap(({ record }) =>
          record.entry === undefined ? [] : [record.entry],
        ),
      );
      for (const id of this.entries.keys()) if (id < earliest) this.entries.delete(id);
    } catch (error) {
      for (const record of changes)
        if (!this.pendingSubmissions.has(record.id)) this.pendingSubmissions.set(record.id, record);
      throw error;
    }
  }

  private queueKey() {
    return [...this.inputs.values()]
      .filter((input) => input.record.status === 'queued')
      .map((input) => input.record.id)
      .join(',');
  }

  private snapshot(): RuntimeConversationSnapshot {
    const id = this.live.run?.inputs[0];
    const active = id === undefined ? undefined : this.inputs.get(id);
    return {
      activeTurn: active && !isTerminal(active.record) ? this.project(active) : null,
      contextStatus: this.contextStatus(),
      queue: [...this.inputs.values()]
        .filter((input) => input.record.status === 'queued')
        .map((input) => this.project(input)),
    };
  }

  private contextStatus(): 'compacting' | 'compaction-failed' | null {
    if (this.live.compactions?.some((compaction) => compaction.blocking)) return 'compacting';
    return !this.live.compactions?.length && this.live.compactionFailure
      ? 'compaction-failed'
      : null;
  }

  private logProgress(live: Readonly<LiveState>) {
    const context = { sessionId: this.lane.sessionId, slot: this.lane.slot };
    for (const compaction of live.compactions ?? [])
      if (!this.live.compactions?.some((previous) => previous.taskId === compaction.taskId))
        logger.info('Pi durable context compaction', {
          ...context,
          operation: 'pi.compaction',
          taskId: Number(compaction.taskId),
          reasonCode: compaction.trigger,
          blocking: compaction.blocking,
          outcome: 'started',
        });
    for (const previous of this.live.compactions ?? [])
      if (!live.compactions?.some((compaction) => compaction.taskId === previous.taskId))
        logger.info('Pi durable context compaction', {
          ...context,
          operation: 'pi.compaction',
          taskId: Number(previous.taskId),
          reasonCode: previous.trigger,
          blocking: previous.blocking,
          outcome: live.compactionFailure?.taskId === previous.taskId ? 'failed' : 'ended',
        });
    if (live.generation?.retry && live.generation.retry !== this.live.generation?.retry)
      logger.warn('Pi durable generation retry scheduled', {
        ...context,
        operation: 'pi.retry',
        retryAttempt: live.generation.attempt,
      });
  }

  private project(input: InputView) {
    const active =
      input.record.status === 'placed' && this.live.run?.inputs.includes(input.record.id) === true;
    const start = input.record.entry;
    const next = Math.min(
      ...[...this.inputs.values()].flatMap(({ record }) =>
        record.entry !== undefined && start !== undefined && record.entry > start
          ? [record.entry]
          : [],
      ),
    );
    const entries =
      input.terminalEntries ??
      [...this.entries.values()]
        .filter((entry) => start !== undefined && entry.id >= start && entry.id < next)
        .sort((a, b) => a.id - b.id);
    const partial = this.live.generation?.message as AssistantMessage | undefined;
    const turn = projectPiTurn({
      lane: this.lane,
      ...input,
      entries,
      active,
      toolStates: this.toolStates,
      nestedTools: this.nestedTools,
      ...(active && partial
        ? {
            partial,
            partialId: `pi:live:${input.record.id}:${this.live.generation?.attempt ?? 0}`,
          }
        : {}),
    });
    return active
      ? { ...turn, ...(this.retrying ? { isRetrying: true } : {}), isPaused: false }
      : turn;
  }
}

function isTerminal(record: SubmissionRecord) {
  return record.status === 'done' || record.status === 'unanswered';
}
