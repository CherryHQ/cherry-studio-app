import {
  attachmentDraftSubmissionSchema,
  attachmentDraftSchema,
  attachmentDraftManifestSchema,
  agentUploadLimits,
  type AgentAttachmentDraftItem,
} from '@cherrystudio/remote-protocol/agent';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as z from 'zod';

import type { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import type {
  RemoteAttachment,
  RemoteAttachmentDraftTarget,
  RemoteAttachmentDraftView,
} from '@/shared/contracts/remoteAgent';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import { RemoteAgentError } from './RemoteAgentError';
import type { AgentRequest } from './remoteContent';
import {
  uploadAttachments,
  uploadProgressSchema,
  type RemoteUploadFiles,
  type GetUploadTransport,
} from './remoteUploads';

const fileSchema = z.object({
  fileEntryId: FileEntryIdSchema,
  name: z.string(),
  mediaType: z.string(),
  attachmentId: z.string(),
  uploadId: z.string(),
  size: z.number().optional(),
  saved: z.array(uploadProgressSchema),
  ready: z.boolean(),
});
const recordSchema = z.object({
  key: z.string(),
  id: z.string(),
  createId: z.string(),
  target: z.union([
    z.object({ sessionId: z.string() }),
    z.object({
      agentId: z.string(),
      workspace: z.union([
        z.object({ kind: z.literal('system') }),
        z.object({ kind: z.literal('registered'), id: z.string() }),
      ]),
    }),
  ]),
  sessionId: z.string().optional(),
  files: z.array(fileSchema),
  generation: z.number(),
  initial: attachmentDraftManifestSchema.optional(),
  remote: attachmentDraftSchema.optional(),
  mutation: z
    .object({
      mutationId: z.string(),
      expectedManifestRevision: z.string(),
      items: attachmentDraftManifestSchema,
    })
    .optional(),
  blocked: z.boolean().optional(),
  error: z.string().optional(),
  cancelId: z.string().optional(),
  submitted: z.boolean().optional(),
  cancelled: z.boolean().optional(),
});
type RecordEntry = z.infer<typeof recordSchema>;

function sameManifest(
  left: readonly AgentAttachmentDraftItem[],
  right: readonly AgentAttachmentDraftItem[],
) {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const other = right[index];
      return (
        item.attachmentId === other.attachmentId &&
        item.uploadId === other.uploadId &&
        item.filename === other.filename &&
        item.mediaType === other.mediaType &&
        item.byteLength === other.byteLength
      );
    })
  );
}

/** Owns pre-send uploads independently of composer mounts and durable send commands. */
export class RemoteAttachmentDrafts {
  private records: RecordEntry[];
  private readonly running = new Map<string, { abort: AbortController; work: Promise<void> }>();
  private readonly progress = new Map<string, { sent: number; total: number; error?: string }>();
  private views: readonly RemoteAttachmentDraftView[] = [];
  private stopped = false;
  private queue: Promise<void> = Promise.resolve();
  private progressTimer?: ReturnType<typeof setTimeout>;
  constructor(
    private readonly binding: string,
    private readonly journal: RemoteAgentCommandJournal,
    private readonly files: RemoteUploadFiles,
    private readonly request: AgentRequest,
    private readonly signal: AbortSignal,
    private readonly changed: () => void,
    private readonly getTransport: GetUploadTransport,
  ) {
    const saved = journal.read(binding);
    let value: unknown;
    try {
      value = saved ? JSON.parse(saved) : [];
    } catch {
      value = [];
    }
    this.records = z.array(recordSchema).safeParse(value).data ?? [];
    this.publish(false);
  }
  get = () => this.views;
  hasPending = () =>
    this.records.some(
      (row) =>
        !row.submitted &&
        !row.cancelled &&
        !row.blocked &&
        (!row.remote || row.files.some((file) => !file.ready) || !row.files.length),
    );
  private persist() {
    this.records = this.records.filter((row) => !row.submitted && !row.cancelled);
    this.journal.write(this.binding, JSON.stringify(this.records));
    this.publish();
  }
  private publish(notify = true) {
    this.views = this.records
      .filter((row) => !row.submitted && !row.cancelled)
      .map((row) => ({
        key: row.key,
        id: row.id,
        sessionId: row.sessionId,
        busy: this.running.has(row.id),
        items: row.files.map((file) => ({
          fileEntryId: file.fileEntryId,
          attachmentId: file.attachmentId,
          name: file.name,
          mediaType: file.mediaType,
          error: this.progress.get(file.attachmentId)?.error,
          sent: file.ready ? (file.size ?? 0) : (this.progress.get(file.attachmentId)?.sent ?? 0),
          total: file.size ?? 0,
          state: file.ready
            ? 'ready'
            : this.progress.get(file.attachmentId)?.error
              ? 'failed'
              : 'uploading',
        })),
      }));
    if (notify) this.changed();
  }
  stage(key: string, target: RemoteAttachmentDraftTarget, attachments: RemoteAttachment[]) {
    if (attachments.length > agentUploadLimits.files)
      throw new RemoteAgentError('ATTACHMENT_LIMIT');
    let row = this.records.find((item) => item.key === key && !item.submitted && !item.cancelled);
    if (row && JSON.stringify(row.target) !== JSON.stringify(target))
      throw new RemoteAgentError('CONFLICT');
    if (!row) {
      if (!attachments.length) return;
      if (this.records.length >= 32) throw new RemoteAgentError('ACTION_LIMIT');
      row = { key, id: randomUUID(), createId: randomUUID(), target, files: [], generation: 0 };
      this.records.push(row);
    }
    if (
      JSON.stringify(
        row.files.map(({ fileEntryId, name, mediaType }) => ({ fileEntryId, name, mediaType })),
      ) === JSON.stringify(attachments)
    ) {
      if (row.blocked) {
        if (
          row.error === 'NOT_FOUND' ||
          (row.remote && Date.parse(row.remote.expiresAt) <= Date.now())
        ) {
          row.id = randomUUID();
          row.initial = undefined;
          row.remote = undefined;
          row.mutation = undefined;
          row.cancelId = undefined;
          row.files = row.files.map((file) => ({
            ...file,
            attachmentId: randomUUID(),
            uploadId: randomUUID(),
            saved: [],
            ready: false,
          }));
        }
        for (const file of row.files) this.progress.delete(file.attachmentId);
        row.blocked = false;
        this.persist();
        void this.run(row);
      }
      return;
    }
    const previous = row.files;
    row.files = attachments.map(
      (file) =>
        previous.find((item) => item.fileEntryId === file.fileEntryId) ?? {
          ...file,
          attachmentId: randomUUID(),
          uploadId: randomUUID(),
          saved: [],
          ready: false,
        },
    );
    row.blocked = false;
    row.generation++;
    this.persist();
    this.running.get(row.id)?.abort.abort();
    void this.run(row);
  }
  recover() {
    for (const row of this.records)
      if (!row.submitted && !row.cancelled && !row.blocked) void this.run(row);
  }
  private run(row: RecordEntry): Promise<void> {
    const current = this.running.get(row.id);
    if (current) return current.work;
    if (this.stopped || row.cancelled || row.submitted) return Promise.resolve();
    const abort = new AbortController();
    const generation = row.generation;
    const signal = AbortSignal.any([abort.signal, this.signal]);
    const work = this.queue
      .then(() => this.advance(row, signal))
      .catch((error) => {
        if (!signal.aborted) {
          row.blocked = !(error instanceof RemoteAgentError && error.retryable);
          row.error = error instanceof RemoteAgentError ? error.code : 'RESOURCE_UNAVAILABLE';
          for (const file of row.files) file.ready = false;
          this.persist();
        }
        if (!signal.aborted)
          for (const file of row.files.filter((file) => !file.ready))
            this.progress.set(file.attachmentId, {
              sent: this.progress.get(file.attachmentId)?.sent ?? 0,
              total: file.size ?? 0,
              error: error instanceof RemoteAgentError ? error.code : 'RESOURCE_UNAVAILABLE',
            });
        this.publish();
      })
      .finally(() => {
        this.running.delete(row.id);
        this.publish();
        if (!this.stopped && row.generation !== generation) void this.run(row);
      });
    this.queue = work;
    this.running.set(row.id, { abort, work });
    this.publish();
    return work;
  }
  private async advance(row: RecordEntry, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (!row.sessionId) {
      if ('sessionId' in row.target) row.sessionId = row.target.sessionId;
      else {
        const receipt = await this.request(
          'agent.sessions.create',
          {
            commandId: row.createId,
            agentId: row.target.agentId,
            workspace:
              row.target.workspace.kind === 'system'
                ? { kind: 'system' }
                : { kind: 'registered', id: row.target.workspace.id },
          },
          signal,
        );
        if (receipt.status !== 'applied' || !receipt.sessionId)
          throw new RemoteAgentError('CONFLICT');
        row.sessionId = receipt.sessionId;
      }
      this.persist();
    }
    for (const file of row.files)
      if (file.size === undefined) {
        const resolved = await this.files.resolve(file.fileEntryId);
        signal.throwIfAborted();
        if (!resolved) throw new RemoteAgentError('RESOURCE_UNAVAILABLE');
        file.size = new File(resolved.uri).size;
      }
    const items = row.files.map((file) => ({
      attachmentId: file.attachmentId,
      uploadId: file.uploadId,
      filename: file.name,
      mediaType: file.mediaType,
      byteLength: file.size!,
    }));
    attachmentDraftManifestSchema.parse(items);
    if (!row.initial) {
      row.initial = items;
      this.persist();
    }
    if (row.remote) {
      row.remote = await this.request('agent.attachmentDrafts.get', { draftId: row.id }, signal);
      if (row.remote.state === 'submitted' || row.remote.state === 'cancelled') {
        row.submitted = true;
        this.persist();
        return;
      }
    }
    if (!row.remote) {
      row.remote = await this.request(
        'agent.attachmentDrafts.open',
        { draftId: row.id, sessionId: row.sessionId, items: row.initial },
        signal,
      );
      this.persist();
    }
    if (row.mutation || !sameManifest(row.remote.items, items)) {
      if (!row.mutation) {
        row.mutation = {
          mutationId: randomUUID(),
          expectedManifestRevision: row.remote.manifestRevision,
          items,
        };
        this.persist();
      }
      row.remote = await this.request(
        'agent.attachmentDrafts.update',
        { draftId: row.id, ...row.mutation },
        signal,
      );
      row.mutation = undefined;
      this.persist();
      signal.throwIfAborted();
      if (!sameManifest(row.remote.items, items)) return this.advance(row, signal);
    }
    if (!items.length) {
      const mutationId = (row.cancelId ??= randomUUID());
      this.persist();
      row.remote = await this.request(
        'agent.attachmentDrafts.cancel',
        { draftId: row.id, mutationId, expectedManifestRevision: row.remote.manifestRevision },
        signal,
      );
      row.cancelled = true;
      this.persist();
      return;
    }
    for (const file of row.files) {
      signal.throwIfAborted();
      if (
        file.ready &&
        row.remote.items.some(
          (item) => item.uploadId === file.uploadId && item.upload?.state === 'ready',
        )
      )
        continue;
      file.ready = false;
      await uploadAttachments(
        [file],
        this.files,
        this.request,
        signal,
        (sent, total) => {
          this.progress.set(file.attachmentId, { sent, total });
          if (!this.progressTimer)
            this.progressTimer = setTimeout(() => {
              this.progressTimer = undefined;
              if (!this.stopped) this.publish();
            }, 100);
        },
        file.saved,
        (saved) => {
          file.saved = saved;
          this.persist();
        },
        this.getTransport,
        { draftId: row.id, attachmentId: file.attachmentId, uploadId: file.uploadId },
      );
      signal.throwIfAborted();
      file.ready = true;
      this.persist();
    }
    row.remote = await this.request('agent.attachmentDrafts.get', { draftId: row.id }, signal);
    this.persist();
  }
  async prepare(key: string, target: RemoteAttachmentDraftTarget, attachments: RemoteAttachment[]) {
    this.stage(key, target, attachments);
    const row = this.records.find((row) => row.key === key);
    if (!row) throw new RemoteAgentError('CONFLICT');
    await this.run(row);
    return this.ready(key, attachments);
  }
  ready(key: string, attachments: RemoteAttachment[]) {
    const row = this.records.find((row) => row.key === key && !row.submitted && !row.cancelled);
    if (
      !row?.remote ||
      !row.sessionId ||
      this.running.has(row.id) ||
      row.files.length !== attachments.length ||
      row.files.some(
        (file, index) => !file.ready || file.fileEntryId !== attachments[index].fileEntryId,
      )
    )
      throw new RemoteAgentError('CONFLICT');
    return {
      sessionId: row.sessionId,
      attachmentDraft: attachmentDraftSubmissionSchema.parse({
        draftId: row.id,
        manifestRevision: row.remote.manifestRevision,
      }),
    };
  }
  reconcile(draftIds: ReadonlySet<string>) {
    let changed = false;
    for (const row of this.records)
      if (draftIds.has(row.id)) {
        row.submitted = true;
        changed = true;
      }
    if (changed) this.persist();
  }
  submitted(id: string) {
    const row = this.records.find((row) => row.id === id);
    if (row) {
      row.submitted = true;
      this.persist();
    }
  }
  stop() {
    this.stopped = true;
    if (this.progressTimer) clearTimeout(this.progressTimer);
    for (const run of this.running.values()) run.abort.abort();
  }
  async drain() {
    while (this.running.size)
      await Promise.allSettled([...this.running.values()].map((run) => run.work));
  }
}
