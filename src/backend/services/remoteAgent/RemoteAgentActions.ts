import { randomUUID } from 'expo-crypto';
import * as z from 'zod';

import type { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import { JsonValueSchema } from '@/shared/contracts/agent';
import type { ControllerAction } from '@/shared/contracts/agent/controller';

import { RemoteAgentError } from './RemoteAgentClient';

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
});
const RecordSchema = z.object({
  action: ActionSchema,
  method: z.string(),
  params: z.record(z.string(), JsonValueSchema),
});
const JournalSchema = z.object({ version: z.literal(1), records: z.array(RecordSchema) });
const ReceiptSchema = z.object({
  status: z.enum([
    'processing',
    'accepted',
    'queued',
    'applied',
    'resolved',
    'cancelled',
    'execution-changed',
    'interrupted',
  ]),
  sessionId: z.string().optional(),
  userMessageId: z.string().optional(),
});
type RecordEntry = z.infer<typeof RecordSchema>;

export class RemoteAgentActions {
  private stopped = false;
  private records: RecordEntry[];
  private snapshot: readonly ControllerAction[];
  private readonly listeners = new Set<() => void>();
  private readonly running = new Map<string, Promise<void>>();
  constructor(
    private readonly binding: string,
    private readonly journal: RemoteAgentCommandJournal,
    private readonly request: Request,
    private readonly changed: () => void,
  ) {
    const stored = journal.read(binding);
    this.records = stored === undefined ? [] : JournalSchema.parse(JSON.parse(stored)).records;
    this.snapshot = this.records.map((entry) => entry.action);
  }
  stop() {
    this.stopped = true;
  }
  async drain() {
    await Promise.allSettled([...this.running.values()]);
  }
  get = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private commit(records: RecordEntry[]) {
    if (this.stopped) return;
    this.journal.write(this.binding, JSON.stringify({ version: 1, records }));
    this.records = records;
    this.snapshot = records.map((entry) => entry.action);
    for (const listener of this.listeners) listener();
  }
  async create(
    kind: ControllerAction['kind'],
    method: string,
    params: Record<string, z.infer<typeof JsonValueSchema>>,
    text?: string,
  ): Promise<ControllerAction> {
    if (this.stopped) throw new RemoteAgentError('CLOSED');
    if (this.records.length >= 200) throw new RemoteAgentError('ACTION_LIMIT');
    const action: ControllerAction = {
      id: randomUUID(),
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
    this.commit([...this.records, entry]);
    await this.run(action.id, false).catch(() => undefined);
    return this.snapshot.find((item) => item.id === action.id) ?? action;
  }
  acknowledgeHistory(sessionId: string, ids: Set<string>) {
    const retained = this.records.filter(
      ({ action }) =>
        !(
          action.kind === 'send' &&
          action.sessionId === sessionId &&
          action.userMessageId &&
          ['accepted', 'queued'].includes(action.status) &&
          ids.has(action.userMessageId)
        ),
    );
    if (retained.length !== this.records.length) this.commit(retained);
  }
  recover() {
    if (this.stopped) return;
    for (const entry of this.records) {
      if (entry.action.status === 'confirming')
        void this.run(entry.action.id, true).catch(() => undefined);
    }
  }
  async retry(id: string) {
    await this.run(id, true);
  }
  dismiss(id: string) {
    // Uncertain actions must remain recoverable across page changes and process death.
    if (
      this.records.some((entry) => entry.action.id === id && entry.action.status === 'confirming')
    )
      return;
    this.commit(this.records.filter((entry) => entry.action.id !== id));
  }
  private run(id: string, recover: boolean): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const existing = this.running.get(id);
    if (existing) return existing;
    const entry = this.records.find((item) => item.action.id === id);
    if (!entry || (entry.action.status !== 'confirming' && entry.action.status !== 'failed'))
      return Promise.resolve();
    const work = this.execute(entry, recover).finally(() => this.running.delete(id));
    this.running.set(id, work);
    return work;
  }
  private async execute(entry: RecordEntry, recover: boolean) {
    let action: ControllerAction = {
      ...entry.action,
      status: 'confirming' as ControllerAction['status'],
      error: undefined,
    };
    if (recover && entry.action.status !== 'confirming')
      this.commit(
        this.records.map((record) =>
          record.action.id === action.id ? { ...record, action } : record,
        ),
      );
    try {
      let receipt: unknown;
      if (recover) {
        try {
          receipt = await this.request('commands.get', { commandId: entry.action.id });
        } catch (error) {
          if (!(error instanceof RemoteAgentError) || error.code !== 'NOT_FOUND') throw error;
        }
      }
      if (receipt === undefined) receipt = await this.request(entry.method, entry.params);
      const parsed = ReceiptSchema.parse(receipt);
      action = {
        ...action,
        status: parsed.status === 'processing' ? 'confirming' : parsed.status,
        ...(parsed.sessionId ? { sessionId: parsed.sessionId } : {}),
        ...(parsed.userMessageId ? { userMessageId: parsed.userMessageId } : {}),
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
        };
      }
      // Timeouts, malformed/lost replies and transport failures remain uncertain, never a fresh action.
    }
    this.commit(
      this.records.map((record) =>
        record.action.id === action.id ? { ...record, action } : record,
      ),
    );
    this.changed();
  }
}
