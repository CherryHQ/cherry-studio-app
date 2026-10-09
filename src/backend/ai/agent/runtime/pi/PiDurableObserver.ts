import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import type {
  AgentEvent,
  AgentEventStream,
  EntryRecord,
  JsonObject,
  MessageChange,
  SnapshotEvent,
  SubmissionId,
  SubmissionRecord,
} from '@earendil-works/pi-durable';

import type { RuntimeConversationEvent, RuntimeConversationSnapshot } from '../durableTypes';
import { projectPiTurn } from './piDurableProjection';
import type { PiDurableRuntime } from './PiDurableRuntime';

type InputView = { record: SubmissionRecord; metadata: JsonObject | undefined };

/** A disposable presentation mount. Stopping it releases observation and preserves execution. */
export class PiDurableObserver {
  private stream: AgentEventStream | undefined;
  private readonly inputs = new Map<SubmissionId, InputView>();
  private readonly entries = new Map<number, EntryRecord>();
  private readonly toolStates = new Map<string, 'running' | 'input-available' | 'interrupted'>();
  private run: readonly SubmissionId[] = [];
  private partial: AssistantMessage | undefined;
  private generationAttempt = 0;

  constructor(
    private readonly runtime: PiDurableRuntime,
    private readonly sessionId: string,
    private readonly listener: (event: RuntimeConversationEvent) => void,
  ) {}

  async start(): Promise<RuntimeConversationSnapshot> {
    if (this.stream) throw new Error('The Pi observer is already attached.');
    const stream = await this.runtime.watch(this.sessionId);
    this.stream = stream;
    try {
      await this.loadSnapshot(stream.snapshot);
      const snapshot = this.snapshot();
      stream.start(async (events) => this.advance(events));
      return snapshot;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const stream = this.stream;
    this.stream = undefined;
    if (stream) await stream.stop();
    this.inputs.clear();
    this.entries.clear();
    this.toolStates.clear();
    this.run = [];
    this.partial = undefined;
  }

  private async loadSnapshot(snapshot: SnapshotEvent) {
    this.inputs.clear();
    this.entries.clear();
    this.toolStates.clear();
    this.run = snapshot.run?.inputs ?? [];
    this.partial = snapshot.generation?.message;
    this.generationAttempt = snapshot.generation?.attempt ?? 0;
    const queued = new Set(snapshot.inbox.map((item) => item.id));
    const through = snapshot.entries.at(-1)?.id;
    for (const input of await this.runtime.submissions([...this.run, ...queued])) {
      if (input.record.type !== 'input') continue;
      // Read immutable identity after attachment, but preserve the lifecycle at the attached frame.
      const record: SubmissionRecord = queued.has(input.record.id)
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
          this.sessionId,
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
  }

  private async advance(events: readonly AgentEvent[]) {
    const replacement = events.find((event) => event.type === 'snapshot');
    if (replacement?.type === 'snapshot') {
      await this.loadSnapshot(replacement);
      this.listener({ type: 'snapshot', snapshot: this.snapshot() });
      return;
    }
    const touched = new Set(this.run);
    const wasQueue = [...this.inputs.values()]
      .filter((input) => input.record.status === 'queued')
      .map((input) => input.record.id)
      .join(',');
    // Immutable input metadata commits before admission. Resolve it once per new visible submission.
    for (const event of events) {
      if (event.type !== 'submission' || event.record.type !== 'input') continue;
      const existing = this.inputs.get(event.record.id);
      this.inputs.set(event.record.id, {
        record: event.record,
        metadata: existing?.metadata ?? (await this.runtime.submissionMetadata(event.record)),
      });
      touched.add(event.record.id);
    }
    for (const event of events)
      switch (event.type) {
        case 'run_start':
          this.run = event.inputs;
          this.partial = undefined;
          this.toolStates.clear();
          event.inputs.forEach((id) => touched.add(id));
          break;
        case 'run_end':
          event.inputs.forEach((id) => touched.add(id));
          this.run = [];
          this.partial = undefined;
          break;
        case 'message_start':
          if (event.message.role === 'assistant') this.partial = event.message;
          break;
        case 'message_update':
          if (this.partial) this.partial = updatedMessage(this.partial, event.changes, event.usage);
          break;
        case 'message_end':
          this.entries.set(event.entry.id, event.entry);
          if (event.entry.model?.some((message) => message.role === 'assistant'))
            this.partial = undefined;
          break;
        case 'entry_appended':
          this.entries.set(event.entry.id, event.entry);
          break;
        case 'auto_retry_start':
          this.partial = undefined;
          this.generationAttempt = event.attempt;
          break;
        case 'auto_retry_end':
          this.generationAttempt = event.attempt;
          break;
        case 'tool_execution_start':
          this.toolStates.set(event.toolCallId, 'running');
          break;
        case 'tool_execution_end':
          if (event.entry) this.entries.set(event.entry.id, event.entry);
          else this.toolStates.set(event.toolCallId, 'interrupted');
          break;
      }
    for (const id of this.run) touched.add(id);
    for (const id of touched) {
      const input = this.inputs.get(id);
      if (input) this.listener({ type: 'turn.updated', turn: this.project(input) });
    }
    const queue = [...this.inputs.values()].filter((input) => input.record.status === 'queued');
    if (wasQueue !== queue.map((input) => input.record.id).join(','))
      this.listener({ type: 'queue.updated', queue: queue.map((input) => this.project(input)) });
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
      queue: [...this.inputs.values()]
        .filter((input) => input.record.status === 'queued')
        .map((input) => this.project(input)),
    };
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
    return projectPiTurn({
      sessionId: this.sessionId,
      ...input,
      entries,
      active,
      toolStates: this.toolStates,
      ...(active && this.partial
        ? {
            partial: this.partial,
            partialId: `pi:live:${input.record.id}:${this.generationAttempt}`,
          }
        : {}),
    });
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
