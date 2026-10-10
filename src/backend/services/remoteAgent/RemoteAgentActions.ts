import {
  agentMethods,
  commandReceiptSchema,
  workspaceSelectionSchema,
  uploadReferencesSchema,
  type AgentUploadReference,
} from '@cherrystudio/remote-protocol/agent';
import { randomUUID } from 'expo-crypto';
import * as z from 'zod';

import type { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import { JsonValueSchema } from '@/shared/contracts/agent';
import type {
  RemoteAttachment,
  RemoteCommand,
  RemoteStartInput,
  RemoteStartOperation,
} from '@/shared/contracts/remoteAgent';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import { RemoteAgentError } from './RemoteAgentError';
import { uploadProgressSchema, type SavedUpload } from './remoteUploads';

const AttachmentSchema = z.object({
  fileEntryId: FileEntryIdSchema,
  name: z.string(),
  mediaType: z.string(),
});
type Request = (method: string, params: unknown) => Promise<unknown>;
const ActionSchema = z.object({
  id: z.string(),
  kind: z.enum(['create', 'send', 'cancel', 'respond']),
  sessionId: z.string().optional(),
  agentId: z.string().optional(),
  userMessageId: z.string().optional(),
  text: z.string().optional(),
  attachments: z.array(AttachmentSchema).optional(),
  status: z.enum(['confirming', 'accepted', 'applied', 'rejected', 'interrupted']),
  error: z.string().optional(),
  errorMessage: z.string().max(512).optional(),
});
const RecordSchema = z.object({
  action: ActionSchema,
  receipt: commandReceiptSchema.optional(),
  uploads: z.array(uploadProgressSchema).optional(),
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
    attachments: z.array(AttachmentSchema).optional(),
    createId: z.string(),
    sendId: z.string(),
    uploads: z.array(uploadProgressSchema).optional(),
    uploaded: uploadReferencesSchema.optional(),
    status: z.enum(['pending', 'applied', 'rejected', 'interrupted']),
    sessionId: z.string().optional(),
    error: z.string().optional(),
    errorMessage: z.string().max(512).optional(),
  })
  .refine((entry) => (entry.workspaceId !== undefined) !== (entry.workspace !== undefined));
const JournalSchema = z.object({
  version: z.literal(3),
  records: z.array(RecordSchema),
  starts: z.array(StartSchema),
});
type StartEntry = z.infer<typeof StartSchema>;
type RecordEntry = z.infer<typeof RecordSchema>;
const isUncertain = (entry: RecordEntry) =>
  entry.action.status === 'confirming' || entry.action.status === 'accepted';

function projectAction(entry: RecordEntry): RemoteCommand {
  const { action, params, receipt } = entry;
  return {
    ...action,
    status: isUncertain(entry) ? 'pending' : (action.status as RemoteCommand['status']),
    ...(receipt?.error ? { errorMessage: receipt.error.message } : {}),
    ...(action.kind === 'respond' && typeof params.interactionId === 'string'
      ? { interactionId: params.interactionId }
      : {}),
  };
}

/** Forgets a start whose Session exists; that Session keeps an undelivered first send like any other. */
function handOff(start: StartEntry, records: RecordEntry[]) {
  return records.filter(
    (entry) =>
      entry.action.id !== start.createId &&
      !(entry.action.id === start.sendId && entry.action.status === 'applied'),
  );
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
  private readonly starting = new Map<string, Promise<RemoteStartOperation>>();
  private snapshot: readonly RemoteCommand[];
  private readonly listeners = new Set<() => void>();
  private readonly running = new Map<string, Promise<void>>();
  constructor(
    private readonly binding: string,
    private readonly journal: RemoteAgentCommandJournal,
    private readonly request: Request,
    private readonly changed: () => void,
    private readonly upload?: (
      attachments: RemoteAttachment[],
      saved: SavedUpload[],
      save: (value: SavedUpload[]) => void,
      owner: { id: string; sessionId?: string; draftId?: string },
    ) => Promise<AgentUploadReference[]>,
  ) {
    const parsed = readJournal(journal, binding);
    this.records = parsed?.records ?? [];
    this.starts = [];
    // After a restart no route is left to hand a created Session to.
    for (const start of parsed?.starts ?? [])
      if (start.sessionId && start.status !== 'pending')
        this.records = handOff(start, this.records);
      else this.starts.push(start);
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
      this.journal.write(this.binding, JSON.stringify({ version: 3, records, starts }));
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
    attachments?: RemoteAttachment[],
  ): Promise<RemoteCommand> {
    if (this.stopped) throw new RemoteAgentError('CLOSED');
    // Keep pending work, open start records and each Session's one undelivered send; a new send
    // replaces it. A settled start's Session already owns its first send like any other.
    const owned = new Set(
      this.starts.flatMap((start) =>
        start.status === 'pending' || !start.sessionId ? [start.createId, start.sendId] : [],
      ),
    );
    const retained = this.records.filter(
      (entry) =>
        owned.has(entry.action.id) ||
        isUncertain(entry) ||
        (entry.action.kind === 'send' &&
          entry.action.status !== 'applied' &&
          !(kind === 'send' && entry.action.sessionId === params.sessionId)),
    );
    if (retained.length >= 200) throw new RemoteAgentError('ACTION_LIMIT');
    const action: RecordEntry['action'] = {
      id: commandId,
      kind,
      status: 'confirming',
      ...(typeof params.agentId === 'string' ? { agentId: params.agentId } : {}),
      ...(typeof params.sessionId === 'string' ? { sessionId: params.sessionId } : {}),
      ...(text ? { text } : {}),
      ...(attachments?.length ? { attachments } : {}),
    };
    const entry = RecordSchema.parse({
      action,
      method,
      params: { ...params, commandId: action.id },
    });
    this.commit([...retained, entry]);
    await this.run(action.id, false).catch(() => undefined);
    return this.snapshot.find((item) => item.id === action.id) ?? projectAction(entry);
  }
  async recover() {
    if (this.stopped) return;
    await Promise.allSettled([
      ...this.starts.flatMap((start) =>
        start.status === 'pending' ? [this.advanceStart(start.id)] : [],
      ),
      ...this.records.flatMap((entry) =>
        isUncertain(entry) ? [this.run(entry.action.id, true)] : [],
      ),
    ]);
  }
  pendingUploads() {
    return [
      ...this.starts
        .filter(
          (entry) =>
            entry.status === 'pending' &&
            entry.attachments?.length &&
            !entry.uploaded &&
            !this.records.some((record) => record.action.id === entry.createId),
        )
        .map((entry) => ({
          id: entry.id,
          draftId: entry.draftId,
          sessionId: undefined,
          uploads: entry.uploads ?? [],
        })),
      ...this.records
        .filter(
          (entry) =>
            isUncertain(entry) && entry.action.attachments?.length && !entry.params.attachments,
        )
        .map((entry) => ({
          id: entry.action.id,
          sessionId: entry.action.sessionId,
          draftId: undefined,
          uploads: entry.uploads ?? [],
        })),
    ];
  }
  cancelUpload(id: string): SavedUpload[] | undefined {
    const pending = this.pendingUploads().find((entry) => entry.id === id);
    if (!pending) return undefined;
    this.commit(
      this.records.map((entry) =>
        entry.action.id === id
          ? { ...entry, action: { ...entry.action, status: 'rejected', error: 'UPLOAD_CANCELLED' } }
          : entry,
      ),
      this.starts.map((entry) =>
        entry.id === id ? { ...entry, status: 'rejected', error: 'UPLOAD_CANCELLED' } : entry,
      ),
    );
    this.changed();
    return pending.uploads;
  }
  private assertUploading(id: string) {
    if (this.stopped) throw new RemoteAgentError('CLOSED');
    if (!this.pendingUploads().some((entry) => entry.id === id))
      throw new RemoteAgentError('UPLOAD_CANCELLED');
  }
  discard(id: string) {
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
    const entry = this.records.find((item) => item.action.id === id);
    if (!entry || isUncertain(entry)) return;
    this.commit(this.records.filter((item) => item !== entry));
  }
  release(id: string) {
    const start = this.starts.find((entry) => entry.id === id);
    if (!start?.sessionId || start.status === 'pending') return;
    this.commit(
      handOff(start, this.records),
      this.starts.filter((entry) => entry !== start),
    );
  }
  async start(input: RemoteStartInput): Promise<RemoteStartOperation> {
    if (this.stopped) throw new RemoteAgentError('CLOSED');
    let entry = this.starts.find((item) => item.draftId === input.draftId);
    // A draft keeps one start: submitting again replaces one that failed before creating a Session.
    if (
      entry &&
      !entry.sessionId &&
      (entry.status === 'rejected' || entry.status === 'interrupted')
    ) {
      this.discard(entry.id);
      entry = undefined;
    }
    if (
      entry &&
      (entry.agentId !== input.agentId ||
        entry.workspaceId !== input.workspaceId ||
        entry.workspace?.kind !== input.workspace?.kind ||
        (entry.workspace?.kind === 'registered' &&
          input.workspace?.kind === 'registered' &&
          entry.workspace.id !== input.workspace.id) ||
        entry.text !== input.text ||
        JSON.stringify(entry.attachments ?? []) !== JSON.stringify(input.attachments ?? []))
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
        ...(input.attachments?.length
          ? { attachments: input.attachments.map((file) => ({ uploadId: file.fileEntryId })) }
          : {}),
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
    // Observers may dismiss a finished start before this resolves, so return the settled view.
    const settled = await this.advanceStart(entry.id);
    if (!settled) throw new RemoteAgentError('CLOSED');
    return settled;
  }
  private advanceStart(id: string): Promise<RemoteStartOperation | undefined> {
    const active = this.starting.get(id);
    if (active) return active;
    const entry = this.starts.find((item) => item.id === id);
    if (!entry || entry.status !== 'pending' || this.stopped)
      return Promise.resolve(entry && projectStart(entry, this.records));
    const work = this.executeStart(entry).finally(() => this.starting.delete(id));
    this.starting.set(id, work);
    return work;
  }
  private updateStart(entry: StartEntry, records = this.records) {
    const view = projectStart(entry, records);
    this.commit(
      records,
      this.starts.map((item) => (item.id === entry.id ? entry : item)),
    );
    return view;
  }
  private async startCommand(
    id: string,
    kind: 'create' | 'send',
    method: string,
    params: Record<string, z.infer<typeof JsonValueSchema>>,
    text?: string,
    attachments?: RemoteAttachment[],
  ) {
    if (this.stopped) throw new RemoteAgentError('CLOSED');
    if (this.records.some((entry) => entry.action.id === id)) await this.run(id, true);
    else await this.create(kind, method, params, text, id, attachments);
    return this.snapshot.find((entry) => entry.id === id)!;
  }
  private async executeStart(original: StartEntry): Promise<RemoteStartOperation> {
    let entry = original;
    let settled = projectStart(entry, this.records);
    try {
      if (
        entry.attachments?.length &&
        !entry.uploaded &&
        !this.records.some((record) => record.action.id === entry.sendId)
      ) {
        if (!this.upload) throw new RemoteAgentError('UPGRADE_REQUIRED');
        this.assertUploading(entry.id);
        const uploaded = await this.upload(
          entry.attachments,
          entry.uploads ?? [],
          (uploads) => {
            this.assertUploading(entry.id);
            entry = { ...entry, uploads };
            this.updateStart(entry);
          },
          { id: entry.id, draftId: entry.draftId },
        );
        this.assertUploading(entry.id);
        entry = { ...entry, uploaded };
        this.updateStart(entry);
      }
      const created = await this.startCommand(entry.createId, 'create', 'agent.sessions.create', {
        agentId: entry.agentId,
        ...(entry.workspace?.kind === 'system'
          ? { workspace: entry.workspace }
          : { workspaceId: entry.workspace?.id ?? entry.workspaceId! }),
      });
      if (this.stopped) return settled;
      if (created.status !== 'applied') return this.finishStart(entry, created);
      if (!created.sessionId) throw new RemoteAgentError('PROTOCOL_ERROR');
      entry = { ...entry, sessionId: created.sessionId };
      settled = this.updateStart(entry);
      const storedSend = this.records.find((record) => record.action.id === entry.sendId);
      let sent: RemoteCommand;
      if (storedSend) {
        await this.run(entry.sendId, true);
        sent = this.snapshot.find((action) => action.id === entry.sendId)!;
      } else {
        const result = agentMethods['agent.sessions.get'].result.parse(
          await this.request('agent.sessions.get', { sessionId: entry.sessionId }),
        );
        if (this.stopped) return settled;
        if (!result.session.idleRevision) throw new RemoteAgentError('CONFLICT');
        sent = await this.startCommand(
          entry.sendId,
          'send',
          'agent.messages.send',
          {
            sessionId: created.sessionId,
            text: entry.text,
            expectedIdleRevision: result.session.idleRevision,
            ...(entry.uploaded ? { attachments: entry.uploaded } : {}),
          },
          entry.text,
          entry.attachments,
        );
      }
      if (!this.stopped) return this.finishStart(entry, sent, true);
    } catch (error) {
      const current = this.starts.find((value) => value.id === entry.id);
      if (!current || current.status !== 'pending')
        return current ? projectStart(current, this.records) : settled;
      if (
        error instanceof RemoteAgentError &&
        !error.retryable &&
        !['CLOSED', 'PROTOCOL_ERROR'].includes(error.code)
      ) {
        const status: StartEntry['status'] =
          error.code === 'COMMAND_INTERRUPTED' ? 'interrupted' : 'rejected';
        const failure = { error: error.code, errorMessage: error.detail };
        // The Session exists but its first send was never recorded; record it so the input stays
        // with that Session after the handoff.
        const unsent =
          entry.sessionId && !this.records.some((record) => record.action.id === entry.sendId)
            ? [
                {
                  action: {
                    id: entry.sendId,
                    kind: 'send' as const,
                    sessionId: entry.sessionId,
                    text: entry.text,
                    attachments: entry.attachments,
                    status,
                    ...failure,
                  },
                  method: 'agent.messages.send',
                  params: { commandId: entry.sendId, sessionId: entry.sessionId, text: entry.text },
                },
              ]
            : [];
        settled = this.updateStart({ ...entry, status, ...failure }, [...this.records, ...unsent]);
      }
    }
    this.changed();
    return settled;
  }
  private finishStart(entry: StartEntry, command: RemoteCommand, sent = false) {
    const view = this.updateStart({
      ...entry,
      status:
        command.status === 'rejected' || command.status === 'interrupted'
          ? command.status
          : sent && command.status === 'applied'
            ? 'applied'
            : 'pending',
      ...(command.error ? { error: command.error, errorMessage: command.errorMessage } : {}),
    });
    this.changed();
    return view;
  }
  private run(id: string, recover: boolean): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const existing = this.running.get(id);
    if (existing) return existing;
    const entry = this.records.find((item) => item.action.id === id);
    if (!entry || !isUncertain(entry)) return Promise.resolve();
    const work = this.execute(entry, recover).finally(() => this.running.delete(id));
    this.running.set(id, work);
    return work;
  }
  private async execute(entry: RecordEntry, recover: boolean) {
    let action: RecordEntry['action'] = {
      ...entry.action,
      status: 'confirming',
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
      if (receipt === undefined) {
        if (entry.action.attachments?.length && !entry.params.attachments) {
          if (!this.upload) throw new RemoteAgentError('UPGRADE_REQUIRED');
          this.assertUploading(action.id);
          const attachments = uploadReferencesSchema.parse(
            await this.upload(
              entry.action.attachments,
              entry.uploads ?? [],
              (uploads) => {
                this.assertUploading(action.id);
                entry = { ...entry, uploads };
                this.commit(
                  this.records.map((record) => (record.action.id === action.id ? entry : record)),
                );
              },
              { id: action.id, sessionId: entry.action.sessionId },
            ),
          );
          this.assertUploading(action.id);
          entry = { ...entry, params: { ...entry.params, attachments } };
          this.commit(
            this.records.map((record) => (record.action.id === action.id ? entry : record)),
          );
        }
        receipt = await this.request(entry.method, entry.params);
      }
      const parsed = commandReceiptSchema.parse(receipt);
      if (parsed.commandId !== entry.action.id || parsed.method !== entry.method)
        throw new RemoteAgentError('PROTOCOL_ERROR');
      storedReceipt = parsed;
      action = {
        ...action,
        status: parsed.status,
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
          status: error.code === 'COMMAND_INTERRUPTED' ? 'interrupted' : 'rejected',
          error: error.code,
          errorMessage: error.detail,
        };
      }
      // Timeouts, malformed/lost replies and transport failures remain uncertain, never a fresh action.
    }
    this.commit(
      this.records.map((record) =>
        record.action.id === action.id && isUncertain(record)
          ? { ...record, action, ...(storedReceipt ? { receipt: storedReceipt } : {}) }
          : record,
      ),
    );
    this.changed();
  }
}
