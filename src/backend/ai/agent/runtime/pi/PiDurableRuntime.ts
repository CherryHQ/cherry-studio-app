import type { Context, JsonValue } from '@earendil-works/chord';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import {
  configure,
  defineDoc,
  defineDocFamily,
  Harness,
  type AgentChange,
  type Conversation,
  type ConversationId,
  type EntryDraft,
  type EntryId,
  type HarnessOptions,
  type JsonObject,
  type Cursor,
  type EntryRecord,
  type InputSubmissionDraft,
  type HookApi,
  LiveDoc,
  type SubmissionRecord,
  type SubmissionId,
  ProviderDoc,
  type Storage,
  watchEvents,
} from '@earendil-works/pi-durable';

import { RuntimeOptionsSchema } from '../runtimeSchemas';
import type { RuntimeOptions } from '../types';

type PiSessionBinding = {
  conversationId: ConversationId | null;
  revision: number;
};

/** The binding identifies a disposable copy of a Cherry transcript revision. */
const SessionBinding = defineDocFamily<PiSessionBinding, number>({
  kind: 'cherry.session',
  version: 1,
  scope: 'session',
  family: true,
  initial: (revision) => ({ conversationId: null, revision }),
});

/** Display identities and original managed-file references, not an assistant transcript mirror. */
const SubmissionMetadata = defineDocFamily<{ value: JsonObject }, JsonObject>({
  kind: 'cherry.submission',
  version: 1,
  scope: 'session',
  family: true,
  initial: (value) => ({ value }),
});

/** Tiny aliases support selected-ID reads without maintaining a second transcript table. */
const MessageBinding = defineDocFamily<
  { requestId: string; role: 'user' | 'assistant' },
  { requestId: string; role: 'user' | 'assistant' }
>({
  kind: 'cherry.message-binding',
  version: 1,
  scope: 'session',
  family: true,
  initial: (identity) => identity,
});

/** No credentials, transport headers or device paths belong in this document. */
const RequestOptions = defineDocFamily<{ value: JsonObject }, JsonObject>({
  kind: 'cherry.request-options',
  version: 1,
  scope: 'session',
  family: true,
  initial: (value) => ({ value }),
});

/** Reconstruct registry code before resume; callbacks and credentials are never stored. */
const Configuration = defineDocFamily<{ value: JsonObject }, JsonObject>({
  kind: 'cherry.configuration',
  version: 1,
  scope: 'session',
  family: true,
  initial: (value) => ({ value }),
});

const UsageDelivery = defineDocFamily<{ value: JsonObject; delivered: boolean }, JsonObject>({
  kind: 'cherry.usage-delivery',
  version: 1,
  scope: 'session',
  family: true,
  initial: (value) => ({ value, delivered: false }),
});

/** Only outstanding IDs: delivery never rescans the complete analytics history. */
const UsagePending = defineDocFamily<{ ids: string[] }, null>({
  kind: 'cherry.usage-pending',
  version: 1,
  scope: 'session',
  family: true,
  initial: () => ({ ids: [] }),
});

/** Managed-file authorization is rebuilt from Cherry and extended by admitted inputs/tools. */
const ResourceScope = defineDoc<{ fileEntryIds: string[] }>({
  kind: 'cherry.resources',
  version: 1,
  scope: 'conversation',
  history: 'latest',
  fork: 'current',
  initial: () => ({ fileEntryIds: [] }),
});

type PiHistoryPage = {
  entries: readonly EntryRecord[];
  next?: Cursor;
  submissions: readonly { record: SubmissionRecord; metadata?: JsonObject }[];
};

type SubmissionIndex = {
  entries: Map<EntryId, SubmissionRecord>;
  queued: Map<SubmissionId, SubmissionRecord>;
};

type PiConversationSeed = {
  sessionId: string;
  revision: number;
  agent: AgentChange;
  options?: RuntimeOptions;
  configuration?: JsonObject;
  resourceFileEntryIds?: readonly string[];
  entries?: readonly EntryDraft[];
};

/** One application-owned Harness. All Pi types stay inside this implementation directory. */
export class PiDurableRuntime {
  /** Derived correlation only: no model bodies, and rebuilt from Pi after reopen or eviction. */
  private readonly submissionIndexes = new Map<ConversationId, SubmissionIndex>();
  private readonly unsubscribeCommits: () => void;

  private constructor(
    private readonly harness: Harness,
    private readonly storage: Storage,
  ) {
    this.unsubscribeCommits = harness.subscribeCommits((publication) => {
      for (const change of publication.changes) {
        if (change.type !== 'submission') continue;
        const record = change.value;
        const index = this.submissionIndexes.get(record.conversationId);
        if (index) indexSubmission(index, record);
      }
    });
  }

  static async open(
    storage: Storage,
    options: HarnessOptions,
    context: Context = BACKGROUND_CONTEXT,
  ): Promise<PiDurableRuntime> {
    return new PiDurableRuntime(await Harness.open(storage, options, context), storage);
  }

  /** Atomic working-copy creation; importing entries creates no tasks or model requests. */
  async ensureConversation(
    seed: PiConversationSeed,
    context: Context = BACKGROUND_CONTEXT,
  ): Promise<Conversation> {
    const id = await this.harness.commit(async (tx) => {
      // Acquire the existing binding before table writes: Pi forbids read-after-write.
      const binding = await tx.doc(SessionBinding, seed.sessionId, seed.revision);
      assertWorkingCopy(binding);
      if (binding.conversationId !== null) {
        if (binding.revision !== seed.revision) throw new Error('The working copy is obsolete.');
        return binding.conversationId;
      }
      if (seed.configuration) await tx.doc(Configuration, seed.sessionId, seed.configuration);
      const conversation = await tx.createConversation({ ownership: { kind: 'ownerless' } });
      await configure(tx, conversation.id, seed.agent);
      const provider = await tx.doc(ProviderDoc, conversation.id);
      await tx.doc(RequestOptions, provider.sessionId, jsonOptions(seed.options ?? {}));
      const resources = await tx.doc(ResourceScope, conversation.id);
      resources.fileEntryIds = [...new Set(seed.resourceFileEntryIds ?? [])];
      for (const entry of seed.entries ?? []) await tx.appendEntry(conversation.id, entry);
      binding.conversationId = conversation.id;
      return conversation.id;
    }, context);
    return this.requireConversation(id, context);
  }

  async conversation(
    sessionId: string,
    context: Context = BACKGROUND_CONTEXT,
  ): Promise<Conversation | undefined> {
    const binding = await this.binding(sessionId, context);
    return binding?.conversationId === undefined || binding.conversationId === null
      ? undefined
      : this.requireConversation(binding.conversationId, context);
  }

  async binding(sessionId: string, context: Context = BACKGROUND_CONTEXT) {
    const binding = await this.harness.snapshot(SessionBinding, sessionId, context);
    if (binding) assertWorkingCopy(binding);
    return binding;
  }

  configuration(sessionId: string, context: Context = BACKGROUND_CONTEXT) {
    return this.harness
      .snapshot(Configuration, sessionId, context)
      .then((document) => document?.value);
  }

  async saveConfiguration(
    sessionId: string,
    value: JsonObject,
    context: Context = BACKGROUND_CONTEXT,
  ) {
    await this.harness.commit(async (tx) => {
      const document = await tx.doc(Configuration, sessionId, value);
      document.value = value;
    }, context);
  }

  async saveUsage(id: string, value: JsonObject) {
    await this.harness.commit(async (tx) => {
      const pending = await tx.doc(UsagePending, 'pending', null);
      const delivery = await tx.doc(UsageDelivery, id, value);
      if (!delivery.delivered && !pending.ids.includes(id)) pending.ids.push(id);
    }, BACKGROUND_CONTEXT);
  }

  async pendingUsage() {
    const reports: { id: string; value: JsonObject }[] = [];
    const pending = await this.harness.snapshot(UsagePending, 'pending', BACKGROUND_CONTEXT);
    for (const id of pending?.ids ?? []) {
      const delivery = await this.harness.snapshot(UsageDelivery, id, BACKGROUND_CONTEXT);
      if (!delivery) throw new Error('A pending usage receipt is missing.');
      if (!delivery.delivered) reports.push({ id, value: delivery.value });
    }
    return reports;
  }

  async acknowledgeUsage(id: string) {
    await this.harness.commit(async (tx) => {
      // The receipt already exists; the seed only satisfies the family signature.
      const delivery = await tx.doc(UsageDelivery, id, {});
      const pending = await tx.doc(UsagePending, 'pending', null);
      delivery.delivered = true;
      pending.ids = pending.ids.filter((value) => value !== id);
    }, BACKGROUND_CONTEXT);
  }

  async providerSessionId(sessionId: string, context: Context = BACKGROUND_CONTEXT) {
    const conversation = await this.requireSession(sessionId, context);
    return (await this.harness.snapshot(ProviderDoc, conversation.id, context))?.sessionId;
  }

  async resourceFileEntryIds(sessionId: string, context: Context = BACKGROUND_CONTEXT) {
    const conversation = await this.requireSession(sessionId, context);
    return (
      (await this.harness.snapshot(ResourceScope, conversation.id, context))?.fileEntryIds ?? []
    );
  }

  async grantFiles(
    sessionId: string,
    ids: readonly string[],
    context: Context = BACKGROUND_CONTEXT,
  ) {
    if (!ids.length) return;
    const conversation = await this.requireSession(sessionId, context);
    await conversation.commit(async (tx) => {
      const scope = await tx.doc(ResourceScope, conversation.id);
      for (const id of ids) if (!scope.fileEntryIds.includes(id)) scope.fileEntryIds.push(id);
    }, context);
  }

  async liveInputs(sessionId: string, context: Context = BACKGROUND_CONTEXT) {
    const conversation = await this.requireSession(sessionId, context);
    const live = await this.harness.snapshot(LiveDoc, conversation.id, context);
    return this.submissions(live?.run?.inputs ?? [], context);
  }

  async submissions(ids: readonly SubmissionId[], context: Context = BACKGROUND_CONTEXT) {
    return Promise.all(
      ids.map(async (id) => {
        const submission = await this.harness.submission(id, context);
        if (!submission) throw new Error('A Pi run references a missing submission.');
        const record = await submission.status(context);
        return { record, metadata: await this.submissionMetadata(record, context) };
      }),
    );
  }

  /** Immutable full-history slice, preserving fork visibility and stopping at the next input. */
  async turnEntries(
    sessionId: string,
    record: SubmissionRecord,
    context: Context = BACKGROUND_CONTEXT,
    through?: EntryId,
  ) {
    if (record.entry === undefined) return [];
    const conversation = await this.requireSession(sessionId, context);
    if (!(await this.storage.entry(conversation.id, record.entry, context))) return [];
    const entries: EntryRecord[] = [];
    let next: Cursor | undefined;
    const maxEntryId =
      through ?? (record.type === 'input' && record.status === 'done' ? record.answer : undefined);
    do {
      const page = await this.history(sessionId, 256, next, context, {
        minEntryId: record.entry,
        ...(maxEntryId !== undefined ? { maxEntryId } : {}),
      });
      const inputs = new Set(
        page.submissions
          .filter(({ record: item }) => item.type === 'input')
          .map(({ record: item }) => item.entry),
      );
      for (const entry of page.entries) {
        if (entry.id > record.entry && inputs.has(entry.id)) {
          entries.length = 0;
          continue;
        }
        entries.push(entry);
        if (entry.id === record.entry) return entries.toReversed();
      }
      next = page.next;
    } while (next);
    return [];
  }

  /** Resolve app choices from Pi's persisted provider affinity, including after a process restart. */
  async requestOptions(
    providerSessionId: string | undefined,
    context: Context = BACKGROUND_CONTEXT,
  ) {
    if (!providerSessionId)
      throw new Error('A durable provider request needs its session identity.');
    const options = await this.harness.snapshot(RequestOptions, providerSessionId, context);
    if (!options) throw new Error('The durable provider request has no application configuration.');
    return RuntimeOptionsSchema.parse(options.value);
  }

  async configure(
    sessionId: string,
    agent: AgentChange,
    options: RuntimeOptions,
    context: Context = BACKGROUND_CONTEXT,
    configuration?: JsonObject,
  ): Promise<void> {
    const conversation = await this.requireSession(sessionId, context);
    await conversation.commit(async (tx) => {
      const provider = await tx.doc(ProviderDoc, conversation.id);
      const request = await tx.doc(RequestOptions, provider.sessionId, jsonOptions(options));
      if (configuration) {
        const blueprint = await tx.doc(Configuration, sessionId, configuration);
        blueprint.value = configuration;
      }
      request.value = jsonOptions(options);
      await configure(tx, conversation.id, agent);
    }, context);
  }

  /**
   * Metadata is committed first, so even an immediately running task can read its display identity.
   * Only native submission admission starts work. A crash in between leaves harmless metadata;
   * a crash after admission is deduplicated by Pi's conversation-scoped requestId on retry.
   */
  async submit(
    sessionId: string,
    draft: InputSubmissionDraft & { requestId: string },
    metadata: JsonObject,
    displayIds?: { userMessageId: string; assistantMessageId: string },
    context: Context = BACKGROUND_CONTEXT,
  ) {
    const conversation = await this.requireSession(sessionId, context);
    if (!draft.requestId.trim()) throw new Error('A durable submission needs a stable requestId.');
    await conversation.commit(async (tx) => {
      const document = await tx.doc(
        SubmissionMetadata,
        metadataKey(conversation.id, draft.requestId),
        metadata,
      );
      if (canonicalJson(document.value) !== canonicalJson(metadata))
        throw new Error('A submission requestId cannot be reused with different display metadata.');
      if (displayIds) {
        for (const [role, messageId] of [
          ['user', displayIds.userMessageId],
          ['assistant', displayIds.assistantMessageId],
        ] as const) {
          if (!messageId.trim())
            throw new Error('A durable display message needs a stable identity.');
          const alias = await tx.doc(MessageBinding, metadataKey(conversation.id, messageId), {
            requestId: draft.requestId,
            role,
          });
          if (alias.requestId !== draft.requestId || alias.role !== role)
            throw new Error('A display message identity cannot belong to two submissions.');
        }
      }
    }, context);
    return conversation.submit(draft, context);
  }

  async submissionMetadata(record: SubmissionRecord, context: Context = BACKGROUND_CONTEXT) {
    if (record.requestId === undefined) return undefined;
    return (
      await this.harness.snapshot(
        SubmissionMetadata,
        metadataKey(record.conversationId, record.requestId),
        context,
      )
    )?.value;
  }

  /** Inherited aliases stay in their source. The visible input boundary prevents future-history leakage. */
  async submissionForMessage(
    sessionId: string,
    messageId: string,
    context: Context = BACKGROUND_CONTEXT,
  ) {
    const target = await this.requireSession(sessionId, context);
    let origin: ConversationId | undefined = target.id;
    while (origin !== undefined) {
      const current: ConversationId = origin;
      const alias = await this.harness.snapshot(
        MessageBinding,
        metadataKey(current, messageId),
        context,
      );
      if (alias) {
        const record = await this.harness.commit(
          (tx) => tx.submissionByRequest(current, alias.requestId),
          context,
        );
        if (
          record &&
          ((record.entry !== undefined &&
            (await this.storage.entry(target.id, record.entry, context))) ||
            (origin === target.id && record.entry === undefined))
        ) {
          return {
            record,
            role: alias.role,
            metadata: await this.submissionMetadata(record, context),
          };
        }
      }
      origin = (await this.storage.conversation(current, context))?.parent?.conversationId;
    }
    return undefined;
  }

  async inputRecord(sessionId: string, requestId: string, context: Context = BACKGROUND_CONTEXT) {
    const conversation = await this.requireSession(sessionId, context);
    return this.harness.commit((tx) => tx.submissionByRequest(conversation.id, requestId), context);
  }

  /** Resolve capabilities by the durable run that owns the task, rather than a stale closure. */
  async inputsForTask(api: HookApi, context: Context = BACKGROUND_CONTEXT) {
    const live = await api.snapshot(LiveDoc, api.conversationId, context);
    return Promise.all(
      (live?.run?.inputs ?? []).map(async (id) => {
        const submission = await this.harness.submission(id, context);
        if (!submission) throw new Error('A live Pi run references a missing submission.');
        const record = await submission.status(context);
        return { record, metadata: await this.submissionMetadata(record, context) };
      }),
    );
  }

  /** Queued withdrawal never turns into cancellation of an already placed run. */
  async withdrawInput(sessionId: string, requestId: string, context: Context = BACKGROUND_CONTEXT) {
    const conversation = await this.requireSession(sessionId, context);
    const record = await this.harness.commit(
      (tx) => tx.submissionByRequest(conversation.id, requestId),
      context,
    );
    return record
      ? this.harness.abortSubmission(record.id, context, conversation.id)
      : ('not_found' as const);
  }

  /** Discover working copies so the Host can compare their revisions with Cherry before recovery. */
  async sessions(context: Context = BACKGROUND_CONTEXT) {
    const sessions: { sessionId: string; binding: Readonly<PiSessionBinding> }[] = [];
    let next: Cursor | undefined;
    do {
      const page = await this.storage.scanDocuments(
        { scope: { kind: 'session' }, at: 'current', kind: SessionBinding.definition.kind },
        256,
        next,
        context,
      );
      for (const document of page.items) {
        if (document.key === undefined) continue;
        const binding = await this.binding(document.key, context);
        if (binding?.conversationId !== undefined && binding.conversationId !== null)
          sessions.push({ sessionId: document.key, binding });
      }
      next = page.next;
    } while (next);
    return sessions;
  }

  /**
   * Full, fork-aware history, including entries outside the active compaction/reset context.
   * Inherited entries retain their original conversationId; their display IDs are read there.
   */
  async history(
    sessionId: string,
    limit: number,
    cursor?: Cursor,
    context: Context = BACKGROUND_CONTEXT,
    range: { minEntryId?: EntryId; maxEntryId?: EntryId } = {},
  ): Promise<PiHistoryPage> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256)
      throw new Error('A Pi history page must contain between 1 and 256 entries.');
    const conversation = await this.requireSession(sessionId, context);
    const { page, records } = await this.harness.commit(async (tx) => {
      const page = await tx.scanEntries(
        { conversationId: conversation.id, ...range },
        limit,
        cursor,
      );
      const visible = new Set(page.items.map((entry) => entry.id));
      const origins = new Set(page.items.map((entry) => entry.conversationId));
      origins.add(conversation.id);
      const records: SubmissionRecord[] = [];
      // Read under the Session line: no native commit can interleave the page and its correlation.
      for (const origin of origins) {
        const index = await this.submissionIndex(origin, context);
        for (const id of visible) {
          const record = index.entries.get(id);
          if (record) records.push(record);
        }
        if (origin === conversation.id) records.push(...index.queued.values());
      }
      return { page, records };
    }, context);
    const submissions = await Promise.all(
      records.map(async (record) => ({
        record,
        metadata: await this.submissionMetadata(record, context),
      })),
    );
    return { entries: page.items, ...(page.next ? { next: page.next } : {}), submissions };
  }

  async watch(sessionId: string, context: Context = BACKGROUND_CONTEXT) {
    const conversation = await this.requireSession(sessionId, context);
    return watchEvents(this.harness, conversation.id, context);
  }

  async reset(sessionId: string, handoff?: string, context: Context = BACKGROUND_CONTEXT) {
    const conversation = await this.requireSession(sessionId, context);
    await conversation.reset(handoff, context);
  }

  async compact(sessionId: string, instructions?: string, context: Context = BACKGROUND_CONTEXT) {
    const conversation = await this.requireSession(sessionId, context);
    const id = await conversation.compact(instructions, context);
    return this.harness.waitForTask(id, context);
  }

  async stop(sessionId: string, context: Context = BACKGROUND_CONTEXT) {
    const conversation = await this.requireSession(sessionId, context);
    await conversation.abort(context, { background: true });
  }

  inspect(context: Context = BACKGROUND_CONTEXT) {
    return this.harness.inspect(context);
  }

  watchWork(context: Context = BACKGROUND_CONTEXT) {
    return this.harness.watchTaskGraph(context);
  }

  /** Call only after current capabilities and approval handlers have been reconstructed. */
  resume(): void {
    this.harness.resume();
  }

  /** Closing preserves unfinished checkpoints. Explicit stop uses Conversation.abort(). */
  async close(): Promise<void> {
    try {
      await this.harness.close(BACKGROUND_CONTEXT);
    } finally {
      this.unsubscribeCommits();
      this.submissionIndexes.clear();
    }
  }

  /** Called on the Session line. Scan once per source; later native publications maintain it. */
  private async submissionIndex(
    origin: ConversationId,
    context: Context,
  ): Promise<SubmissionIndex> {
    const existing = this.submissionIndexes.get(origin);
    if (existing) {
      this.submissionIndexes.delete(origin);
      this.submissionIndexes.set(origin, existing);
      return existing;
    }
    const index: SubmissionIndex = { entries: new Map(), queued: new Map() };
    let next: Cursor | undefined;
    do {
      const page = await this.storage.scanSubmissions(
        { conversationId: origin },
        256,
        next,
        context,
      );
      for (const record of page.items) indexSubmission(index, record);
      next = page.next;
    } while (next);
    this.submissionIndexes.set(origin, index);
    // Bound the number of loaded sources when browsing many independent chats or deep fork trees.
    if (this.submissionIndexes.size > 8) {
      const oldest = this.submissionIndexes.keys().next().value;
      if (oldest !== undefined) this.submissionIndexes.delete(oldest);
    }
    return index;
  }

  /**
   * Retire app bindings through the public kernel API. The now-unreachable log is reclaimed when
   * the idle runtime file is discarded; no code depends on upstream SQL tables.
   */
  async retireSession(sessionId: string, context: Context = BACKGROUND_CONTEXT) {
    const binding = await this.binding(sessionId, context);
    const conversationId = binding?.conversationId;
    if (conversationId === undefined || conversationId === null) return;
    const provider = await this.harness.snapshot(ProviderDoc, conversationId, context);
    const requestIds: string[] = [];
    const messageIds: string[] = [];
    let next: Cursor | undefined;
    do {
      const page = await this.storage.scanSubmissions({ conversationId }, 256, next, context);
      for (const record of page.items) {
        if (record.requestId === undefined) continue;
        requestIds.push(record.requestId);
        const value = await this.submissionMetadata(record, context);
        for (const field of ['userMessageId', 'assistantMessageId'] as const) {
          const id = value?.[field];
          if (typeof id === 'string') messageIds.push(id);
        }
      }
      next = page.next;
    } while (next);
    await this.harness.commit(async (tx) => {
      await tx.retireDoc(SessionBinding, sessionId);
      await tx.retireDoc(Configuration, sessionId);
      if (provider) await tx.retireDoc(RequestOptions, provider.sessionId);
      for (const requestId of requestIds)
        await tx.retireDoc(SubmissionMetadata, metadataKey(conversationId, requestId));
      for (const messageId of messageIds)
        await tx.retireDoc(MessageBinding, metadataKey(conversationId, messageId));
    }, context);
    this.submissionIndexes.delete(conversationId);
  }

  private async requireConversation(id: ConversationId, context: Context): Promise<Conversation> {
    const conversation = await this.harness.conversation(id, context);
    if (!conversation) throw new Error('A Pi session binding references missing history.');
    return conversation;
  }

  private async requireSession(sessionId: string, context: Context): Promise<Conversation> {
    const conversation = await this.conversation(sessionId, context);
    if (!conversation) throw new Error('The Pi conversation has not been created.');
    return conversation;
  }
}

function assertWorkingCopy(binding: Readonly<PiSessionBinding>) {
  if (!Number.isSafeInteger(binding.revision) || binding.revision < 0)
    throw new Error(
      'This Pi database predates Cherry-owned transcripts. Preserve it for migration; it cannot be discarded as a working copy.',
    );
}

function metadataKey(conversationId: ConversationId, requestId: string): string {
  return `${conversationId}:${requestId}`;
}

function jsonOptions(options: RuntimeOptions): JsonObject {
  return {
    ...(options.reasoningEffort !== undefined ? { reasoningEffort: options.reasoningEffort } : {}),
    ...(options.maxOutputTokens !== undefined ? { maxOutputTokens: options.maxOutputTokens } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  };
}

/** Compare detached JSON independent of object property insertion order. */
function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function indexSubmission(index: SubmissionIndex, record: SubmissionRecord): void {
  if (record.entry !== undefined) index.entries.set(record.entry, record);
  if (record.status === 'queued') index.queued.set(record.id, record);
  else index.queued.delete(record.id);
}
