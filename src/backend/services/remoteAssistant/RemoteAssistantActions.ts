import { commandReceiptSchema } from '@cherrystudio/remote-protocol/agent';
import { assistantMethods, type AssistantMutation } from '@cherrystudio/remote-protocol/assistant';
import { randomUUID } from 'expo-crypto';
import * as z from 'zod';

import type { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import { RemoteConversationError } from '@/backend/services/remoteConversation';
import type {
  RemoteCommand,
  RemoteStartInput,
  RemoteStartOperation,
} from '@/shared/contracts/remoteAgent';

import type { AssistantRequest } from './assistantRequest';

const status = z.enum(['pending', 'applied', 'rejected', 'interrupted']);
const commandSchema = z.object({
  id: z.string(),
  kind: z.enum(['create', 'send', 'cancel', 'respond']),
  status,
  agentId: z.string().optional(),
  sessionId: z.string().optional(),
  interactionId: z.string().optional(),
  text: z.string().optional(),
  error: z.string().optional(),
  errorMessage: z.string().optional(),
});
const recordSchema = z
  .object({
    view: commandSchema,
    method: z.enum([
      'assistant.topics.create',
      'assistant.messages.send',
      'assistant.executions.cancel',
      'assistant.interactions.respond',
    ]),
    params: z.record(z.string(), z.json()).optional(),
  })
  .refine(
    (entry) => entry.view.status !== 'pending' || entry.params !== undefined,
    'Pending commands require their exact payload',
  );
const startSchema = z.object({
  id: z.string(),
  draftId: z.string(),
  agentId: z.string(),
  text: z.string(),
  status,
  sessionId: z.string().optional(),
  error: z.string().optional(),
  errorMessage: z.string().optional(),
  createId: z.string(),
  sendId: z.string(),
  configurationRevision: z.string(),
});
const journalSchema = z.object({
  version: z.literal(1),
  records: z.array(recordSchema),
  starts: z.array(startSchema),
});
type RecordEntry = z.infer<typeof recordSchema>;
type StartEntry = z.infer<typeof startSchema>;

/** Persist before dispatch; a lost response is recovered with the original command id and payload. */
export class RemoteAssistantActions {
  private records: RecordEntry[] = [];
  private starts: StartEntry[] = [];
  private commands: readonly RemoteCommand[] = [];
  private startViews: readonly RemoteStartOperation[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly starting = new Map<string, Promise<RemoteStartOperation>>();
  private stopped = false;
  constructor(
    private readonly binding: string,
    private readonly journal: RemoteAgentCommandJournal,
    private readonly request: AssistantRequest,
    private readonly changed: () => void,
  ) {
    const stored = journal.read(binding);
    if (stored) {
      try {
        const saved = journalSchema.parse(JSON.parse(stored));
        for (const entry of saved.records)
          if (entry.params) assistantMethods[entry.method].params.parse(entry.params);
        this.records = saved.records;
        this.starts = saved.starts;
      } catch {
        journal.remove(binding);
      }
    }
    this.updateViews();
  }
  get = () => this.commands;
  getStarts = () => this.startViews;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private updateViews() {
    this.commands = this.records.map((entry) => entry.view);
    this.startViews = this.starts.map(
      ({ createId: _createId, sendId: _sendId, configurationRevision: _revision, ...view }) => view,
    );
  }
  private commit(records = this.records, starts = this.starts) {
    if (this.stopped) return;
    if (records.length || starts.length)
      this.journal.write(this.binding, JSON.stringify({ version: 1, records, starts }));
    else this.journal.remove(this.binding);
    this.records = records;
    this.starts = starts;
    this.updateViews();
    for (const listener of this.listeners) listener();
    this.changed();
  }
  async create(
    kind: RemoteCommand['kind'],
    method: AssistantMutation,
    params: Record<string, z.infer<ReturnType<typeof z.json>>>,
    text?: string,
    id = randomUUID(),
  ): Promise<RemoteCommand> {
    if (this.stopped) throw new RemoteConversationError('CLOSED');
    const existing = this.records.find((entry) => entry.view.id === id);
    if (existing) {
      await this.run(id, true);
      return this.get().find((entry) => entry.id === id)!;
    }
    const parsed = assistantMethods[method].params.parse({ ...params, commandId: id });
    const owned = new Set(this.starts.flatMap((entry) => [entry.createId, entry.sendId]));
    const records = this.records.filter(
      (entry) =>
        owned.has(entry.view.id) ||
        entry.view.status === 'pending' ||
        (entry.view.kind === 'send' &&
          entry.view.status !== 'applied' &&
          !(kind === 'send' && entry.view.sessionId === params.topicId)),
    );
    if (records.length >= 200) throw new RemoteConversationError('ACTION_LIMIT');
    const entry = recordSchema.parse({
      method,
      params: parsed,
      view: {
        id,
        kind,
        status: 'pending',
        text,
        sessionId: params.topicId,
        agentId: params.assistantId,
        interactionId: params.interactionId,
      },
    });
    this.commit([...records, entry]);
    await this.run(id, false);
    return this.get().find((item) => item.id === id)!;
  }
  private run(id: string, recover: boolean): Promise<void> {
    const work = this.running.get(id);
    if (work) return work;
    const entry = this.records.find((item) => item.view.id === id);
    if (!entry || entry.view.status !== 'pending' || this.stopped) return Promise.resolve();
    const pending = this.execute(entry, recover).finally(() => this.running.delete(id));
    this.running.set(id, pending);
    return pending;
  }
  private async execute(entry: RecordEntry, recover: boolean) {
    let view = entry.view;
    try {
      let receipt;
      if (recover) {
        try {
          receipt = await this.request('assistant.commands.get', { commandId: view.id });
        } catch (error) {
          if (!(error instanceof RemoteConversationError) || error.code !== 'NOT_FOUND')
            throw error;
        }
      }
      receipt ??= await this.request(
        entry.method,
        assistantMethods[entry.method].params.parse(entry.params),
      );
      const parsed = commandReceiptSchema.parse(receipt);
      if (parsed.commandId !== view.id || parsed.method !== entry.method)
        throw new RemoteConversationError('PROTOCOL_ERROR');
      view = {
        ...view,
        status: parsed.status === 'accepted' ? 'pending' : parsed.status,
        sessionId: parsed.topicId ?? view.sessionId,
        error: parsed.error?.reason,
        errorMessage: parsed.error?.message,
      };
    } catch (error) {
      if (
        error instanceof RemoteConversationError &&
        !error.retryable &&
        !['CLOSED', 'PROTOCOL_ERROR'].includes(error.code)
      )
        view = {
          ...view,
          status: error.code === 'COMMAND_INTERRUPTED' ? 'interrupted' : 'rejected',
          error: error.code,
          errorMessage: error.detail,
        };
    }
    this.commit(this.records.map((item) => (item.view.id === view.id ? { ...item, view } : item)));
  }
  async start(
    input: RemoteStartInput,
    configurationRevision: string,
  ): Promise<RemoteStartOperation> {
    if (input.attachments?.length || input.workspace || input.workspaceId)
      throw new RemoteConversationError('INVALID_PARAMS');
    assistantMethods['assistant.messages.send'].params.parse({
      commandId: 'validation',
      topicId: 'validation',
      assistantId: input.agentId,
      expectedAssistantRevision: configurationRevision,
      parentAnchorId: null,
      expectedHistoryRevision: '0',
      text: input.text,
    });
    const old = this.starts.find((entry) => entry.draftId === input.draftId);
    if (old?.status === 'pending' || old?.sessionId) {
      if (old.agentId !== input.agentId || old.text !== input.text)
        throw new RemoteConversationError('IDEMPOTENCY_CONFLICT');
      return this.advanceStart(old.id);
    }
    if (this.starts.length >= 200) throw new RemoteConversationError('ACTION_LIMIT');
    const entry: StartEntry = {
      id: randomUUID(),
      draftId: input.draftId,
      agentId: input.agentId,
      text: input.text,
      status: 'pending',
      createId: randomUUID(),
      sendId: randomUUID(),
      configurationRevision,
    };
    this.commit(this.records, [...this.starts.filter((item) => item !== old), entry]);
    return this.advanceStart(entry.id);
  }
  private advanceStart(id: string): Promise<RemoteStartOperation> {
    const work = this.starting.get(id);
    if (work) return work;
    const entry = this.starts.find((item) => item.id === id)!;
    if (entry.status !== 'pending') return Promise.resolve(entry);
    const pending = this.executeStart(entry).finally(() => this.starting.delete(id));
    this.starting.set(id, pending);
    return pending;
  }
  private saveStart(entry: StartEntry) {
    this.commit(
      this.records,
      this.starts.map((item) => (item.id === entry.id ? entry : item)),
    );
    return entry;
  }
  private async executeStart(original: StartEntry): Promise<RemoteStartOperation> {
    let entry = original;
    try {
      if (!entry.sessionId) {
        const command = await this.create(
          'create',
          'assistant.topics.create',
          { assistantId: entry.agentId },
          undefined,
          entry.createId,
        );
        if (command.status !== 'applied')
          return this.saveStart({
            ...entry,
            status: command.status,
            error: command.error,
            errorMessage: command.errorMessage,
          });
        if (!command.sessionId) throw new RemoteConversationError('PROTOCOL_ERROR');
        entry = this.saveStart({ ...entry, sessionId: command.sessionId });
      }
      const saved = this.records.find((item) => item.view.id === entry.sendId);
      let command: RemoteCommand;
      if (saved) {
        await this.run(entry.sendId, true);
        command = this.get().find((item) => item.id === entry.sendId)!;
      } else {
        const { topic } = await this.request('assistant.topics.get', { topicId: entry.sessionId! });
        if (
          topic.parentAnchorId !== null ||
          topic.activeExecutionIds.length ||
          topic.assistantId !== entry.agentId
        )
          throw new RemoteConversationError('CONFLICT');
        command = await this.create(
          'send',
          'assistant.messages.send',
          {
            topicId: topic.topicId,
            assistantId: entry.agentId,
            expectedAssistantRevision: entry.configurationRevision,
            parentAnchorId: topic.parentAnchorId,
            expectedHistoryRevision: topic.historyRevision,
            text: entry.text,
          },
          entry.text,
          entry.sendId,
        );
      }
      return this.saveStart({
        ...entry,
        status: command.status,
        error: command.error,
        errorMessage: command.errorMessage,
      });
    } catch (error) {
      if (
        error instanceof RemoteConversationError &&
        !error.retryable &&
        !['CLOSED', 'PROTOCOL_ERROR'].includes(error.code)
      ) {
        const status = error.code === 'COMMAND_INTERRUPTED' ? 'interrupted' : 'rejected';
        // An already-created topic owns the undelivered first input even if admission was never sent.
        if (entry.sessionId && !this.records.some((item) => item.view.id === entry.sendId)) {
          // This is a terminal input record, not a wire command that can be replayed.
          this.commit([
            ...this.records,
            {
              method: 'assistant.messages.send',
              view: {
                id: entry.sendId,
                kind: 'send',
                sessionId: entry.sessionId,
                text: entry.text,
                status,
                error: error.code,
                errorMessage: error.detail,
              },
            },
          ]);
        }
        return this.saveStart({ ...entry, status, error: error.code, errorMessage: error.detail });
      }
      return entry;
    }
  }
  async recover() {
    await Promise.allSettled(
      this.records
        .filter((entry) => entry.view.status === 'pending')
        .map((entry) => this.run(entry.view.id, true)),
    );
    await Promise.allSettled(
      this.starts
        .filter((entry) => entry.status === 'pending')
        .map((entry) => this.advanceStart(entry.id)),
    );
  }
  discard(id: string) {
    this.commit(
      this.records.filter((entry) => entry.view.id !== id || entry.view.status === 'pending'),
      this.starts.filter((entry) => entry.id !== id || entry.status === 'pending'),
    );
  }
  release(id: string) {
    const start = this.starts.find((entry) => entry.id === id);
    if (!start?.sessionId || start.status === 'pending') return;
    this.commit(
      this.records.filter(
        (entry) =>
          entry.view.id !== start.createId &&
          !(entry.view.id === start.sendId && entry.view.status === 'applied'),
      ),
      this.starts.filter((entry) => entry !== start),
    );
  }
  stop() {
    this.stopped = true;
  }
  async drain() {
    await Promise.allSettled([...this.running.values(), ...this.starting.values()]);
  }
}
