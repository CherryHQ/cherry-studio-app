import {
  agentMethods,
  commandReceiptSchema,
  workspaceSelectionSchema,
} from '@cherrystudio/remote-protocol/agent';
import { randomUUID } from 'expo-crypto';
import * as z from 'zod';

import type { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import { JsonValueSchema } from '@/shared/contracts/agent';
import type {
  RemoteCommand,
  RemoteStartInput,
  RemoteStartOperation,
} from '@/shared/contracts/remoteAgent';

import { RemoteAgentError } from './RemoteAgentError';

type Request = (method: string, params: unknown) => Promise<unknown>;
const ActionSchema = z.object({
  id: z.string(),
  kind: z.enum(['create', 'send', 'cancel', 'respond']),
  sessionId: z.string().optional(),
  agentId: z.string().optional(),
  userMessageId: z.string().optional(),
  text: z.string().optional(),
  status: z.enum([
    'confirming',
    'accepted',
    'queued',
    'applied',
    'resolved',
    'cancelled',
    'execution-changed',
    'interrupted',
    'failed',
  ]),
  error: z.string().optional(),
  errorMessage: z.string().max(512).optional(),
});
const RecordSchema = z.object({
  action: ActionSchema,
  receipt: commandReceiptSchema.optional(),
  method: z.string(),
  params: z.record(z.string(), JsonValueSchema),
});
const StartSchema = z
  .object({
    id: z.string(),
    draftId: z.string(),
    agentId: z.string(),
    workspaceId: z.string().optional(),
    workspace: workspaceSelectionSchema.optional(),
    text: z.string(),
    createId: z.string(),
    sendId: z.string(),
    status: z.enum(['pending', 'applied', 'rejected', 'interrupted']),
    sessionId: z.string().optional(),
    error: z.string().optional(),
    errorMessage: z.string().max(512).optional(),
  })
  .refine((entry) => (entry.workspaceId !== undefined) !== (entry.workspace !== undefined));
const JournalSchema = z.object({
  version: z.literal(2),
  records: z.array(RecordSchema),
  starts: z.array(StartSchema),
});
type StartEntry = z.infer<typeof StartSchema>;
type RecordEntry = z.infer<typeof RecordSchema>;

function projectAction({ action, params, receipt }: RecordEntry): RemoteCommand {
  if (receipt?.error) action = { ...action, errorMessage: receipt.error.message };
  if (action.status === 'accepted') action = { ...action, status: 'confirming' };
  return action.kind === 'respond' && typeof params.interactionId === 'string'
    ? { ...action, interactionId: params.interactionId }
    : action;
}

function projectStart(
  { createId, sendId, ...view }: StartEntry,
  records: RecordEntry[],
): RemoteStartOperation {
  const record =
    records.find((entry) => entry.action.id === sendId) ??
    records.find((entry) => entry.action.id === createId);
  const errorMessage =
    view.errorMessage ??
    (record?.receipt?.error?.reason === view.error ? record?.receipt?.error?.message : undefined);
  return { ...view, ...(errorMessage ? { errorMessage } : {}) };
}

/** The journal is unreleased state; a record this build cannot read is evidence of nothing. */
function readJournal(journal: RemoteAgentCommandJournal, binding: string) {
  const stored = journal.read(binding);
  if (stored === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    value = undefined;
  }
  const parsed = JournalSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  journal.remove(binding);
  return undefined;
}

export class RemoteAgentActions {
  private stopped = false;
  private records: RecordEntry[];
  private starts: StartEntry[];
  private startSnapshot: readonly RemoteStartOperation[];
  private readonly starting = new Map<string, Promise<void>>();
  private snapshot: readonly RemoteCommand[];
  private readonly listeners = new Set<() => void>();
  private readonly running = new Map<string, Promise<void>>();
  constructor(
    private readonly binding: string,
    private readonly journal: RemoteAgentCommandJournal,
    private readonly request: Request,
    private readonly changed: () => void,
  ) {
    const parsed = readJournal(journal, binding);
    this.records = parsed?.records ?? [];
    this.starts = parsed?.starts ?? [];
    this.startSnapshot = this.starts.map((entry) => projectStart(entry, this.records));
    this.snapshot = this.records.map(projectAction);
  }
  stop() {
    this.stopped = true;
  }
  async drain() {
    await Promise.allSettled([...this.running.values(), ...this.starting.values()]);
  }
  get = () => this.snapshot;
  getStarts = () => this.startSnapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private commit(records: RecordEntry[], starts = this.starts) {
    if (this.stopped) return;
    if (records.length || starts.length)
      this.journal.write(this.binding, JSON.stringify({ version: 2, records, starts }));
    else this.journal.remove(this.binding);
    this.records = records;
    this.starts = starts;
    this.startSnapshot = starts.map((entry) => projectStart(entry, records));
    this.snapshot = records.map(projectAction);
    for (const listener of this.listeners) listener();
  }
  async create(
    kind: RemoteCommand['kind'],
    method: string,
    params: Record<string, z.infer<typeof JsonValueSchema>>,
    text?: string,
    commandId = randomUUID(),
  ): Promise<RemoteCommand> {
    if (this.stopped) throw new RemoteAgentError('CLOSED');
    const retained = this.records.filter(
      ({ action }) =>
        action.kind === 'create' ||
        action.status !== 'applied' ||
        this.starts.some((start) => start.sendId === action.id),
    );
    if (retained.length >= 200) throw new RemoteAgentError('ACTION_LIMIT');
    const action: RemoteCommand = {
      id: commandId,
      kind,
      status: 'confirming',
      ...(typeof params.agentId === 'string' ? { agentId: params.agentId } : {}),
      ...(typeof params.sessionId === 'string' ? { sessionId: params.sessionId } : {}),
      ...(text ? { text } : {}),
    };
    const entry = RecordSchema.parse({
      action,
      method,
      params: { ...params, commandId: action.id },
    });
    this.commit([...retained, entry]);
    await this.run(action.id, false).catch(() => undefined);
    return this.snapshot.find((item) => item.id === action.id) ?? action;
  }
  recover() {
    if (this.stopped) return;
    for (const start of this.starts)
      if (start.status === 'pending') void this.advanceStart(start.id).catch(() => undefined);
    for (const entry of this.records) {
      if (['confirming', 'accepted'].includes(entry.action.status))
        void this.run(entry.action.id, true).catch(() => undefined);
    }
  }
  async retry(id: string) {
    if (this.starts.some((entry) => entry.id === id)) await this.advanceStart(id);
    else await this.run(id, true);
  }
  dismiss(id: string) {
    const start = this.starts.find((entry) => entry.id === id);
    if (start) {
      if (start.status === 'pending') return;
      this.commit(
        this.records.filter(
          (entry) => entry.action.id !== start.createId && entry.action.id !== start.sendId,
        ),
        this.starts.filter((entry) => entry.id !== id),
      );
      return;
    }
    // Uncertain actions must remain recoverable across page changes and process death.
    if (
      this.records.some(
        (entry) =>
          entry.action.id === id && ['confirming', 'accepted'].includes(entry.action.status),
      )
    )
      return;
    this.commit(this.records.filter((entry) => entry.action.id !== id));
  }
  async start(input: RemoteStartInput): Promise<RemoteStartOperation> {
    if (this.stopped) throw new RemoteAgentError('CLOSED');
    let entry = this.starts.find((item) => item.draftId === input.draftId);
    if (
      entry &&
      (entry.agentId !== input.agentId ||
        entry.workspaceId !== input.workspaceId ||
        entry.workspace?.kind !== input.workspace?.kind ||
        (entry.workspace?.kind === 'registered' &&
          input.workspace?.kind === 'registered' &&
          entry.workspace.id !== input.workspace.id) ||
        entry.text !== input.text)
    )
      throw new RemoteAgentError('IDEMPOTENCY_CONFLICT');
    if (!entry) {
      if (this.starts.length >= 200) throw new RemoteAgentError('ACTION_LIMIT');
      // Validate text before either command is admitted. Both IDs survive a crash between steps.
      agentMethods['agent.messages.send'].params.parse({
        commandId: 'validation',
        sessionId: 'validation',
        expectedIdleRevision: '0',
        text: input.text,
      });
      StartSchema.parse({
        ...input,
        id: 'validation',
        createId: 'validation',
        sendId: 'validation',
        status: 'pending',
      });
      entry = {
        ...input,
        id: randomUUID(),
        createId: randomUUID(),
        sendId: randomUUID(),
        status: 'pending',
      };
      this.commit(this.records, [...this.starts, entry]);
    }
    await this.advanceStart(entry.id);
    return this.getStarts().find((item) => item.id === entry.id)!;
  }
  private advanceStart(id: string): Promise<void> {
    const active = this.starting.get(id);
    if (active) return active;
    const entry = this.starts.find((item) => item.id === id);
    if (!entry || entry.status !== 'pending' || this.stopped) return Promise.resolve();
    const work = this.executeStart(entry).finally(() => this.starting.delete(id));
    this.starting.set(id, work);
    return work;
  }
  private updateStart(entry: StartEntry) {
    this.commit(
      this.records,
      this.starts.map((item) => (item.id === entry.id ? entry : item)),
    );
  }
  private async startCommand(
    id: string,
    kind: 'create' | 'send',
    method: string,
    params: Record<string, z.infer<typeof JsonValueSchema>>,
    text?: string,
  ) {
    if (this.stopped) throw new RemoteAgentError('CLOSED');
    if (this.records.some((entry) => entry.action.id === id)) await this.run(id, true);
    else await this.create(kind, method, params, text, id);
    return this.snapshot.find((entry) => entry.id === id)!;
  }
  private async executeStart(original: StartEntry) {
    let entry = original;
    try {
      const created = await this.startCommand(entry.createId, 'create', 'agent.sessions.create', {
        agentId: entry.agentId,
        ...(entry.workspace?.kind === 'system'
          ? { workspace: entry.workspace }
          : { workspaceId: entry.workspace?.id ?? entry.workspaceId! }),
      });
      if (this.stopped) return;
      if (created.status !== 'applied') {
        this.finishStart(entry, created);
        return;
      }
      if (!created.sessionId) throw new RemoteAgentError('PROTOCOL_ERROR');
      entry = { ...entry, sessionId: created.sessionId };
      this.updateStart(entry);
      const storedSend = this.records.find((record) => record.action.id === entry.sendId);
      let sent: RemoteCommand;
      if (storedSend) {
        await this.run(entry.sendId, true);
        sent = this.snapshot.find((action) => action.id === entry.sendId)!;
      } else {
        const result = agentMethods['agent.sessions.get'].result.parse(
          await this.request('agent.sessions.get', { sessionId: entry.sessionId }),
        );
        if (this.stopped) return;
        if (!result.session.idleRevision) throw new RemoteAgentError('CONFLICT');
        sent = await this.startCommand(
          entry.sendId,
          'send',
          'agent.messages.send',
          {
            sessionId: created.sessionId,
            text: entry.text,
            expectedIdleRevision: result.session.idleRevision,
          },
          entry.text,
        );
      }
      if (!this.stopped) this.finishStart(entry, sent, true);
    } catch (error) {
      if (
        error instanceof RemoteAgentError &&
        !error.retryable &&
        !['CLOSED', 'PROTOCOL_ERROR'].includes(error.code)
      )
        this.updateStart({
          ...entry,
          status: error.code === 'COMMAND_INTERRUPTED' ? 'interrupted' : 'rejected',
          error: error.code,
          errorMessage: error.detail,
        });
    }
    this.changed();
  }
  private finishStart(entry: StartEntry, command: RemoteCommand, sent = false) {
    this.updateStart({
      ...entry,
      status:
        command.status === 'failed'
          ? 'rejected'
          : command.status === 'interrupted'
            ? 'interrupted'
            : sent && command.status === 'applied'
              ? 'applied'
              : 'pending',
      ...(command.error ? { error: command.error, errorMessage: command.errorMessage } : {}),
    });
    this.changed();
  }
  private run(id: string, recover: boolean): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const existing = this.running.get(id);
    if (existing) return existing;
    const entry = this.records.find((item) => item.action.id === id);
    if (!entry || !['confirming', 'accepted'].includes(entry.action.status))
      return Promise.resolve();
    const work = this.execute(entry, recover).finally(() => this.running.delete(id));
    this.running.set(id, work);
    return work;
  }
  private async execute(entry: RecordEntry, recover: boolean) {
    let action: RemoteCommand = {
      ...entry.action,
      status: 'confirming' as RemoteCommand['status'],
      error: undefined,
      errorMessage: undefined,
    };
    if (recover && entry.action.status !== 'confirming')
      this.commit(
        this.records.map((record) =>
          record.action.id === action.id ? { ...record, action } : record,
        ),
      );
    let storedReceipt: z.infer<typeof commandReceiptSchema> | undefined;
    try {
      let receipt: unknown;
      if (recover) {
        try {
          receipt = await this.request('agent.commands.get', { commandId: entry.action.id });
        } catch (error) {
          if (!(error instanceof RemoteAgentError) || error.code !== 'NOT_FOUND') throw error;
        }
      }
      if (receipt === undefined) receipt = await this.request(entry.method, entry.params);
      const parsed = commandReceiptSchema.parse(receipt);
      if (parsed.commandId !== entry.action.id || parsed.method !== entry.method)
        throw new RemoteAgentError('PROTOCOL_ERROR');
      storedReceipt = parsed;
      action = {
        ...action,
        status: parsed.status === 'rejected' ? 'failed' : parsed.status,
        ...(parsed.error ? { error: parsed.error.reason, errorMessage: parsed.error.message } : {}),
        ...(parsed.sessionId ? { sessionId: parsed.sessionId } : {}),
      };
    } catch (error) {
      if (
        error instanceof RemoteAgentError &&
        !error.retryable &&
        !['CLOSED', 'PROTOCOL_ERROR'].includes(error.code)
      ) {
        action = {
          ...action,
          status: error.code === 'COMMAND_INTERRUPTED' ? 'interrupted' : 'failed',
          error: error.code,
          errorMessage: error.detail,
        };
      }
      // Timeouts, malformed/lost replies and transport failures remain uncertain, never a fresh action.
    }
    this.commit(
      this.records.map((record) =>
        record.action.id === action.id
          ? { ...record, action, ...(storedReceipt ? { receipt: storedReceipt } : {}) }
          : record,
      ),
    );
    this.changed();
  }
}
