import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { CompactionEntry, GenerationTask } from '@earendil-works/pi-durable';
import type {
  AgentEvent,
  AgentEventStream,
  EntryRecord,
  JsonObject,
  MessageChange,
  SnapshotEvent,
  SubmissionId,
  SubmissionRecord,
  TaskGraph,
  TaskGraphWatch,
} from '@earendil-works/pi-durable';

import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  laneKey,
  sameLane,
  type RuntimeConversationEvent,
  type RuntimeConversationSnapshot,
  type RuntimeLane,
} from '../durableTypes';
import type { RuntimeToolProgress } from '../types';
import { projectPiTurn } from './piDurableProjection';
import type { PiDurableRuntime } from './PiDurableRuntime';
import { hasResponseContent } from './piStreamEvents';

type InputView = { record: SubmissionRecord; metadata: JsonObject | undefined };
const logger = loggerService.withContext('PiDurableObserver');

/** A disposable presentation mount. Stopping it releases observation and preserves execution. */
export class PiDurableObserver {
  private orderedInbox: SubmissionId[] = [];
  private publication: Promise<void> = Promise.resolve();
  private stream: AgentEventStream | undefined;
  private workWatch: TaskGraphWatch | undefined;
  private tasks: TaskGraph = { tasks: {} };
  private readonly inputs = new Map<SubmissionId, InputView>();
  private readonly entries = new Map<number, EntryRecord>();
  private readonly toolStates = new Map<string, 'running' | 'input-available' | 'interrupted'>();
  private readonly nestedTools = new Map<
    string,
    { parentCallId: string } & Omit<RuntimeToolProgress['calls'][number], 'id'>
  >();
  private run: readonly SubmissionId[] = [];
  private partial: AssistantMessage | undefined;
  private generationAttempt = 0;
  /** A provider attempt failed and Pi retries it; cleared once the next attempt produces output. */
  private retrying = false;
  private readonly compactions = new Map<number, boolean>();
  private compactionFailed = false;

  constructor(
    private readonly runtime: PiDurableRuntime,
    private readonly lane: RuntimeLane,
    private readonly listener: (event: RuntimeConversationEvent) => void,
  ) {}

  async start(): Promise<RuntimeConversationSnapshot> {
    if (this.stream) throw new Error('The Pi observer is already attached.');
    const stream = await this.runtime.watch(laneKey(this.lane));
    this.stream = stream;
    try {
      const workWatch = await this.runtime.watchWork();
      this.workWatch = workWatch;
      this.tasks = workWatch.value;
      await this.loadSnapshot(stream.snapshot);
      const snapshot = this.snapshot();
      stream.start((events) => this.serialize(() => this.advance(events)));
      workWatch.start(async (tasks) => {
        const previous = this.tasks;
        this.tasks = tasks;
        for (const id of this.run) {
          const input = this.inputs.get(id);
          if (input && this.isPaused(input, previous) !== this.isPaused(input, tasks))
            this.listener({ type: 'turn.updated', turn: this.project(input) });
        }
      });
      return snapshot;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const stream = this.stream;
    const workWatch = this.workWatch;
    this.stream = undefined;
    this.workWatch = undefined;
    await Promise.all([stream?.stop(), workWatch?.stop()]);
    this.tasks = { tasks: {} };
    this.inputs.clear();
    this.orderedInbox = [];
    this.entries.clear();
    this.toolStates.clear();
    this.nestedTools.clear();
    this.run = [];
    this.partial = undefined;
    this.retrying = false;
    this.compactions.clear();
    this.compactionFailed = false;
  }

  observes(lane: RuntimeLane): boolean {
    return sameLane(this.lane, lane);
  }

  private serialize(action: () => Promise<void>): Promise<void> {
    const result = this.publication.then(action);
    this.publication = result.catch(() => {});
    return result;
  }

  reconcileQueue(): Promise<void> {
    return this.serialize(async () => {
      await this.refreshQueue();
      this.listener({ type: 'queue.updated', queue: this.queue() });
    });
  }

  private async refreshQueue() {
    const queue = await this.runtime.readQueuedInputs(laneKey(this.lane));
    this.orderedInbox = [];
    for (const input of queue) {
      const current = this.inputs.get(input.record.id);
      // Authoritative queue reads never downgrade a lifecycle frame already observed as placed.
      if (current && current.record.status !== 'queued') {
        current.metadata = input.metadata;
        continue;
      }
      this.inputs.set(input.record.id, input);
      this.orderedInbox.push(input.record.id);
    }
  }

  private queue() {
    return this.orderedInbox.flatMap((id) => {
      const input = this.inputs.get(id);
      return input?.record.status === 'queued' ? [this.project(input)] : [];
    });
  }

  private async loadSnapshot(snapshot: SnapshotEvent) {
    const previousInputs = new Map(this.inputs);
    this.inputs.clear();
    this.entries.clear();
    this.toolStates.clear();
    this.nestedTools.clear();
    this.run = snapshot.run?.inputs ?? [];
    this.partial = snapshot.generation?.message;
    this.generationAttempt = snapshot.generation?.attempt ?? 0;
    this.retrying = snapshot.generation?.retry !== undefined;
    this.compactions.clear();
    for (const compaction of snapshot.compactions)
      this.compactions.set(compaction.taskId, compaction.blocking);
    this.compactionFailed = snapshot.compactionFailure !== undefined;
    const queued = new Set(snapshot.inbox.map((item) => item.id));
    const through = snapshot.entries.at(-1)?.id;
    for (const input of await this.runtime.submissions([...this.run, ...queued])) {
      if (input.record.type !== 'input') continue;
      // Read immutable identity after attachment, but preserve the lifecycle at the attached frame.
      const known = previousInputs.get(input.record.id);
      const record: SubmissionRecord =
        queued.has(input.record.id) && known && known.record.status !== 'queued'
          ? known.record
          : queued.has(input.record.id) && input.record.entry === undefined
            ? {
                id: input.record.id,
                conversationId: input.record.conversationId,
                requestId: input.record.requestId,
                type: 'input',
                status: 'queued',
              }
            : input.record.entry !== undefined
              ? {
                  id: input.record.id,
                  conversationId: input.record.conversationId,
                  requestId: input.record.requestId,
                  type: 'input',
                  status: 'placed',
                  entry: input.record.entry,
                }
              : input.record;
      this.inputs.set(record.id, { ...input, record });
      if (!queued.has(record.id))
        for (const entry of await this.runtime.turnEntries(
          laneKey(this.lane),
          record,
          BACKGROUND_CONTEXT,
          through,
        ))
          this.entries.set(entry.id, entry);
    }
    for (const entry of snapshot.entries) this.entries.set(entry.id, entry);
    for (const tool of snapshot.tools) {
      if (tool.status !== 'done')
        this.toolStates.set(tool.callId, tool.status === 'running' ? 'running' : 'input-available');
      else if (tool.entry === undefined) this.toolStates.set(tool.callId, 'interrupted');
    }
    await this.refreshQueue();
    for (const tool of snapshot.nestedTools)
      this.nestedTools.set(tool.callId, {
        parentCallId: tool.parentCallId,
        name: tool.name,
        args: JSON.stringify(tool.arguments).slice(0, 1000),
        status: tool.summary
          ? tool.summary.isError
            ? 'error'
            : 'ok'
          : tool.status === 'done'
            ? 'interrupted'
            : tool.status,
      });
  }

  private async advance(events: readonly AgentEvent[]) {
    const replacement = events.find((event) => event.type === 'snapshot');
    if (replacement?.type === 'snapshot') {
      await this.loadSnapshot(replacement);
      this.listener({ type: 'snapshot', snapshot: this.snapshot() });
      return;
    }
    const touched = new Set(this.run);
    const previousContextStatus = this.contextStatus();
    const wasQueue = JSON.stringify(this.queue());
    for (const event of events) {
      if (event.type !== 'submission' || event.record.type !== 'input') continue;
      this.inputs.set(event.record.id, {
        record: event.record,
        metadata: await this.runtime.submissionMetadata(event.record),
      });
      touched.add(event.record.id);
    }
    for (const event of events)
      switch (event.type) {
        case 'run_start':
          this.run = event.inputs;
          this.partial = undefined;
          this.retrying = false;
          this.toolStates.clear();
          this.nestedTools.clear();
          event.inputs.forEach((id) => touched.add(id));
          break;
        case 'run_end':
          event.inputs.forEach((id) => touched.add(id));
          this.run = [];
          this.partial = undefined;
          this.retrying = false;
          break;
        case 'message_start':
          if (event.message.role === 'assistant') {
            this.partial = event.message;
            // The failed attempt's own message follows its retry event in the same batch.
            if (event.message.stopReason !== 'error' && hasResponseContent(event.message))
              this.retrying = false;
          }
          break;
        case 'message_update':
          if (this.partial) {
            this.partial = updatedMessage(this.partial, event.changes, event.usage);
            if (this.partial.stopReason !== 'error' && hasResponseContent(this.partial))
              this.retrying = false;
          }
          break;
        case 'message_end':
          this.entries.set(event.entry.id, event.entry);
          for (const message of event.entry.model ?? []) {
            if (message.role === 'assistant') {
              this.partial = undefined;
              // Throttled partials may leave the first response content in the final entry only.
              if (message.stopReason !== 'error' && hasResponseContent(message))
                this.retrying = false;
            }
          }
          break;
        case 'entry_appended':
          this.entries.set(event.entry.id, event.entry);
          if (CompactionEntry.is(event.entry)) {
            this.compactionFailed = false;
            logger.info('Pi durable context compaction', {
              sessionId: this.lane.sessionId,
              slot: this.lane.slot,
              operation: 'pi.compaction',
              entryId: Number(event.entry.id),
              reasonCode: event.entry.data?.reason,
              outcome: 'committed',
            });
          }
          break;
        case 'compaction_start':
          this.compactions.set(event.taskId, event.blocking);
          logger.info('Pi durable context compaction', {
            sessionId: this.lane.sessionId,
            slot: this.lane.slot,
            operation: 'pi.compaction',
            taskId: Number(event.taskId),
            reasonCode: event.reason,
            blocking: event.blocking,
            outcome: 'started',
          });
          break;
        case 'compaction_end':
          logger.info('Pi durable context compaction', {
            sessionId: this.lane.sessionId,
            slot: this.lane.slot,
            operation: 'pi.compaction',
            taskId: Number(event.taskId),
            reasonCode: event.reason,
            blocking: this.compactions.get(event.taskId),
            outcome: event.error === undefined ? 'ended' : 'failed',
          });
          this.compactions.delete(event.taskId);
          if (event.error !== undefined) this.compactionFailed = true;
          break;
        case 'auto_retry_start':
          logger.warn('Pi durable generation retry scheduled', {
            ...this.diagnosticContext(),
            operation: 'pi.retry',
            retryAttempt: event.attempt,
          });
          this.partial = undefined;
          this.generationAttempt = event.attempt;
          this.retrying = true;
          break;
        case 'auto_retry_end':
          this.generationAttempt = event.attempt;
          break;
        case 'tool_execution_start':
          if (event.parentToolCallId) {
            this.nestedTools.set(event.toolCallId, {
              parentCallId: event.parentToolCallId,
              name: event.toolName,
              args: JSON.stringify(event.args).slice(0, 1000),
              status: 'running',
            });
            break;
          }
          this.toolStates.set(event.toolCallId, 'running');
          break;
        case 'tool_execution_end':
          if (event.parentToolCallId) {
            const nested = this.nestedTools.get(event.toolCallId);
            if (nested) {
              nested.status = event.result
                ? event.result.isError
                  ? 'error'
                  : 'ok'
                : 'interrupted';
            }
            break;
          }
          if (event.entry) this.entries.set(event.entry.id, event.entry);
          else {
            this.toolStates.set(event.toolCallId, 'interrupted');
            logger.warn('Pi durable tool execution interrupted', {
              ...this.diagnosticContext(),
              operation: 'pi.execute_tool',
              toolCallId: event.toolCallId,
            });
          }
          break;
        case 'task_failed':
          logger.error('Pi durable task failed', {
            // Compaction and extension tasks need not belong to the currently displayed run.
            ...(event.kind === 'pi.generation' || event.kind === 'pi.tool'
              ? this.diagnosticContext()
              : { sessionId: this.lane.sessionId, slot: this.lane.slot }),
            operation: 'pi.task',
            taskId: Number(event.taskId),
            taskKind: event.kind,
          });
          break;
      }
    if (this.contextStatus() !== previousContextStatus)
      this.listener({ type: 'context.updated', status: this.contextStatus() });
    for (const id of this.run) touched.add(id);
    for (const id of touched) {
      const input = this.inputs.get(id);
      if (input) this.listener({ type: 'turn.updated', turn: this.project(input) });
    }
    if (events.some((event) => event.type === 'inbox_update' || event.type === 'submission'))
      await this.refreshQueue();
    const queue = this.queue();
    if (wasQueue !== JSON.stringify(queue)) this.listener({ type: 'queue.updated', queue });
    // The observer holds only current presentation. Finished history is read from native entries.
    for (const [id, input] of this.inputs)
      if (input.record.status === 'done' || input.record.status === 'unanswered')
        this.inputs.delete(id);
    const earliest = Math.min(
      ...[...this.inputs.values()].flatMap(({ record }) =>
        record.entry === undefined ? [] : [record.entry],
      ),
    );
    for (const id of this.entries.keys()) if (id < earliest) this.entries.delete(id);
  }

  private snapshot(): RuntimeConversationSnapshot {
    const active = this.run[0] !== undefined ? this.inputs.get(this.run[0]) : undefined;
    return {
      activeTurn: active ? this.project(active) : null,
      contextStatus: this.contextStatus(),
      queue: this.queue(),
    };
  }

  /** Only blocking compaction delays a reply; background compaction is not presented. */
  private contextStatus(): 'compacting' | 'compaction-failed' | null {
    for (const blocking of this.compactions.values()) if (blocking) return 'compacting';
    // A background compaction in progress supersedes an earlier failure.
    return this.compactions.size === 0 && this.compactionFailed ? 'compaction-failed' : null;
  }

  private diagnosticContext() {
    const active = this.run[0] !== undefined ? this.inputs.get(this.run[0]) : undefined;
    return {
      sessionId: this.lane.sessionId,
      slot: this.lane.slot,
      requestId: active?.record.requestId,
      turnId: active?.metadata?.turnId,
      assistantMessageId: active?.metadata?.assistantMessageId,
    };
  }

  private isPaused(input: InputView, graph = this.tasks): boolean {
    return Object.values(graph.tasks).some((task) => {
      if (task.blocked !== 'restart_limit') return false;
      let owner = task;
      while (owner.owner !== undefined) {
        if (owner.background) return false;
        const parent = graph.tasks[String(owner.owner)];
        if (!parent) return false;
        owner = parent;
      }
      // Child conversations belong to the generation that awaits them; standalone compactions do not.
      return (
        !owner.background &&
        owner.kind === GenerationTask.definition.name &&
        owner.conversationId === input.record.conversationId
      );
    });
  }

  private project(input: InputView) {
    const active = this.run.includes(input.record.id);
    const start = input.record.entry;
    const next = Math.min(
      ...[...this.inputs.values()].flatMap(({ record }) =>
        record.entry !== undefined && start !== undefined && record.entry > start
          ? [record.entry]
          : [],
      ),
    );
    const entries = [...this.entries.values()]
      .filter((entry) => start !== undefined && entry.id >= start && entry.id < next)
      .sort((a, b) => a.id - b.id);
    const turn = projectPiTurn({
      lane: this.lane,
      ...input,
      entries,
      active,
      toolStates: this.toolStates,
      nestedTools: this.nestedTools,
      ...(active && this.partial
        ? {
            partial: this.partial,
            partialId: `pi:live:${input.record.id}:${this.generationAttempt}`,
          }
        : {}),
    });
    return active
      ? { ...turn, ...(this.retrying ? { isRetrying: true } : {}), isPaused: this.isPaused(input) }
      : turn;
  }
}

function updatedMessage(
  message: AssistantMessage,
  changes: readonly MessageChange[],
  usage: AssistantMessage['usage'],
): AssistantMessage {
  const next = JSON.parse(JSON.stringify(message)) as AssistantMessage;
  next.usage = usage;
  for (const change of changes) {
    if (change.type === 'message') return change.message;
    if (
      change.type === 'text_start' ||
      change.type === 'thinking_start' ||
      change.type === 'toolcall_start' ||
      change.type === 'block'
    ) {
      next.content[change.contentIndex] = change.block;
      continue;
    }
    const block = next.content[change.contentIndex];
    if (!block) continue;
    if (change.type === 'text_delta' && block.type === 'text') block.text += change.delta;
    else if (change.type === 'thinking_delta' && block.type === 'thinking')
      block.thinking += change.delta;
    else if (change.type === 'toolcall_delta' && block.type === 'toolCall')
      appendAtPath(block.arguments, change.path, change.delta);
  }
  return next;
}

function appendAtPath(value: unknown, path: readonly (string | number)[], delta: string) {
  if (value === null || typeof value !== 'object' || path.length === 0) return;
  const object = value as Record<string | number, unknown>;
  const key = path[0]!;
  if (path.length === 1)
    object[key] = typeof object[key] === 'string' ? object[key] + delta : delta;
  else appendAtPath(object[key], path.slice(1), delta);
}
