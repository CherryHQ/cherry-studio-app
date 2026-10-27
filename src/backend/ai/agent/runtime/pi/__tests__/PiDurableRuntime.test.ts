import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { Api, Model } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import {
  createRegistry,
  defineDocFamily,
  Harness,
  InboxDoc,
  LiveDoc,
  GenerationTask,
  MemoryStorage,
  ProviderDoc,
  UserEntry,
  type ConversationId,
  type TaskGraphNode,
  type TaskId,
  type JsonObject,
} from '@earendil-works/pi-durable';

import type { RuntimeEditQueuedInput } from '../../durableTypes';
import { serializePiUserContent } from '../modelMessages';
import { hasRunnablePiTasks, PiDurableRuntime } from '../PiDurableRuntime';
import { emptyAssistantMessage } from '../piStreamEvents';
import { ToolInstructions } from '../piToolInstructions';

function options() {
  return {
    models: createModels({
      authContext: { env: async () => undefined, fileExists: async () => false },
    }),
    registry: createRegistry(),
    settings: { afterFailedRun: 'continue' as const },
  };
}

const seed = {
  sessionId: 'business-session',
  revision: 0,
  agent: { instructions: 'Continue the conversation.' },
  entries: [
    {
      kind: UserEntry.kind,
      model: [{ role: 'user' as const, content: 'Remember the blue theme.', timestamp: 1 }],
    },
  ],
};

test('execution protection follows runnable work, including due sleeps and cancellation', () => {
  const task: TaskGraphNode = {
    id: 1 as TaskId,
    kind: 'pi.generation',
    conversationId: 1 as ConversationId,
    background: false,
    abortRequested: false,
    conversations: [],
    state: { status: 'sleeping', phase: 'generate', until: 2000 },
  };
  expect(hasRunnablePiTasks({ tasks: { '1': task } }, 1000)).toBe(false);
  expect(hasRunnablePiTasks({ tasks: { '1': task } }, 2000)).toBe(true);
  expect(hasRunnablePiTasks({ tasks: { '1': { ...task, abortRequested: true } } }, 1000)).toBe(
    true,
  );
  const pending: TaskGraphNode = { ...task, state: { status: 'pending', phase: 'generate' } };
  expect(hasRunnablePiTasks({ tasks: { '1': { ...pending, blocked: 'restart_limit' } } })).toBe(
    false,
  );
  expect(hasRunnablePiTasks({ tasks: { '1': { ...pending, blocked: 'missing_task' } } })).toBe(
    false,
  );
  expect(hasRunnablePiTasks({ tasks: { '1': pending, '2': task } }, 1000)).toBe(true);
  expect(hasRunnablePiTasks({ tasks: {} })).toBe(false);
});

describe('PiDurableRuntime identity and handoff', () => {
  test('forks replace current source grants with the supplied history prefix grants', async () => {
    const runtime = await PiDurableRuntime.open(new MemoryStorage(), options());
    try {
      const source = await runtime.ensureConversation({
        ...seed,
        resourceFileEntryIds: ['earlier-file'],
      });
      const at = await source.commit(
        async (tx) => (await tx.appendEntry(source.id, seed.entries[0]!)).id,
        BACKGROUND_CONTEXT,
      );
      await runtime.grantFiles(seed.sessionId, ['later-file']);
      await runtime.forkConversation(seed.sessionId, {
        ...seed,
        sessionId: 'fork',
        at,
        resourceFileEntryIds: ['earlier-file'],
      });
      expect(await runtime.resourceFileEntryIds('fork')).toEqual(['earlier-file']);
      expect(await runtime.resourceFileEntryIds(seed.sessionId)).toEqual([
        'earlier-file',
        'later-file',
      ]);
      await runtime.forkConversation(seed.sessionId, {
        ...seed,
        sessionId: 'empty-grants',
        at,
        resourceFileEntryIds: [],
      });
      expect(await runtime.resourceFileEntryIds('empty-grants')).toEqual([]);
    } finally {
      await runtime.close();
    }
  });

  test('reopens an existing run and advances waiting input after a missing-model failure', async () => {
    class ReopenableStorage extends MemoryStorage {
      override async close() {}
    }
    const storage = new ReopenableStorage();
    const first = await Harness.open(storage, options(), BACKGROUND_CONTEXT);
    const conversation = await first.createConversation(
      { ownership: { kind: 'ownerless' } },
      BACKGROUND_CONTEXT,
    );
    await conversation.commit(async (tx) => {
      const inbox = await tx.doc(InboxDoc, conversation.id);
      const live = await tx.doc(LiveDoc, conversation.id);
      const entry = await tx.appendEntry(conversation.id, seed.entries[0]!);
      const active = await tx.createSubmission({
        conversationId: conversation.id,
        type: 'input',
        status: 'placed',
        requestId: 'active',
        entry: entry.id,
      });
      const taskId = await tx.createTask(
        GenerationTask,
        {},
        {
          ownership: { kind: 'conversation' },
          conversationId: conversation.id,
        },
      );
      live.run = { taskId, inputs: [active.id] };
      const queued = await tx.createSubmission({
        conversationId: conversation.id,
        type: 'input',
        status: 'queued',
        requestId: 'waiting',
      });
      inbox.items.push({ id: queued.id, mode: 'followUp', content: 'Waiting' });
    }, BACKGROUND_CONTEXT);
    await first.close(BACKGROUND_CONTEXT);
    const reopened = await Harness.open(storage, options(), BACKGROUND_CONTEXT);
    try {
      const inspected = await reopened.inspect(BACKGROUND_CONTEXT);
      expect(inspected.submissions.map((record) => [record.requestId, record.status])).toEqual([
        ['active', 'placed'],
        ['waiting', 'queued'],
      ]);
      expect(inspected.tasks).toHaveLength(1);
      reopened.resume();
      await reopened.waitForIdle(BACKGROUND_CONTEXT);
      const records = await Promise.all(
        inspected.submissions.map(async ({ id }) =>
          (await reopened.submission(id, BACKGROUND_CONTEXT))!.status(BACKGROUND_CONTEXT),
        ),
      );
      expect(records.map((record) => record.status)).toEqual(['unanswered', 'unanswered']);
      expect(records.every((record) => record.entry !== undefined)).toBe(true);
      expect((await reopened.inspect(BACKGROUND_CONTEXT)).submissions).toEqual([]);
    } finally {
      await reopened.close(BACKGROUND_CONTEXT);
    }
  });

  test('a failed blocking compaction settles its input and advances queued input', async () => {
    const configuration = options();
    const model: Model<Api> = {
      api: 'openai-responses',
      provider: 'test',
      id: 'small-context',
      name: 'Small context',
      baseUrl: '',
      contextWindow: 128,
      maxTokens: 32,
      input: ['text'],
      reasoning: false,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    jest.spyOn(configuration.models, 'getModel').mockReturnValue(model);
    const summarize = jest.spyOn(configuration.models, 'completeSimple').mockResolvedValue({
      ...emptyAssistantMessage(model),
      stopReason: 'error',
      errorMessage: 'Compaction provider failed',
    });
    const generate = jest.spyOn(configuration.models, 'streamSimple').mockImplementation(() => {
      throw new Error('A failed blocking compaction must not send oversized context');
    });
    const harness = await Harness.open(
      new MemoryStorage(),
      {
        ...configuration,
        settings: {
          ...configuration.settings,
          compaction: {
            enabled: true,
            reserveTokens: 32,
            keepRecentTokens: 1,
            backgroundTokens: 0,
          },
          retry: { enabled: false },
        },
      },
      BACKGROUND_CONTEXT,
    );
    try {
      const conversation = await harness.createConversation(
        {
          ownership: { kind: 'ownerless' },
          agent: { model: { provider: model.provider, modelId: model.id } },
          init: async (tx, conversationId) => {
            await tx.appendEntry(UserEntry, conversationId, {
              model: [{ role: 'user', content: 'Old context '.repeat(200), timestamp: 1 }],
            });
          },
        },
        BACKGROUND_CONTEXT,
      );
      const first = await conversation.submit(
        {
          type: 'input',
          requestId: 'first',
          content: 'First input',
        },
        BACKGROUND_CONTEXT,
      );
      const second = await conversation.submit(
        {
          type: 'input',
          requestId: 'second',
          content: 'Queued input',
        },
        BACKGROUND_CONTEXT,
      );
      expect((await second.status(BACKGROUND_CONTEXT)).status).toBe('queued');
      harness.resume();
      await harness.waitForIdle(BACKGROUND_CONTEXT);
      for (const submission of [first, second]) {
        expect(await submission.status(BACKGROUND_CONTEXT)).toMatchObject({
          status: 'unanswered',
          reason: 'model_error',
          detail: expect.stringContaining('Compaction provider failed'),
          entry: expect.any(Number),
        });
      }
      expect(summarize).toHaveBeenCalledTimes(2);
      expect(generate).not.toHaveBeenCalled();
      expect((await harness.inspect(BACKGROUND_CONTEXT)).submissions).toEqual([]);
    } finally {
      await harness.close(BACKGROUND_CONTEXT);
    }
  });

  test('reopening does not promote queued input in a task-owned conversation', async () => {
    class ReopenableStorage extends MemoryStorage {
      override async close() {}
    }
    const storage = new ReopenableStorage();
    const first = await Harness.open(storage, options(), BACKGROUND_CONTEXT);
    const parent = await first.createConversation(
      { ownership: { kind: 'ownerless' } },
      BACKGROUND_CONTEXT,
    );
    const childId = await parent.commit(async (tx) => {
      const owner = await tx.createTask(
        GenerationTask,
        {},
        { ownership: { kind: 'conversation' }, conversationId: parent.id },
      );
      const child = await tx.createConversation({ ownership: { kind: 'task', taskId: owner } });
      const inbox = await tx.doc(InboxDoc, child.id);
      const queued = await tx.createSubmission({
        conversationId: child.id,
        type: 'input',
        status: 'queued',
        requestId: 'child-input',
      });
      inbox.items.push({ id: queued.id, mode: 'followUp', content: 'Child input' });
      return child.id;
    }, BACKGROUND_CONTEXT);
    await first.close(BACKGROUND_CONTEXT);
    const reopened = await Harness.open(storage, options(), BACKGROUND_CONTEXT);
    try {
      const state = await reopened.inspect(BACKGROUND_CONTEXT);
      expect(state.submissions).toEqual([
        expect.objectContaining({
          conversationId: childId,
          requestId: 'child-input',
          status: 'queued',
        }),
      ]);
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks.every((task) => task.record.conversationId !== childId)).toBe(true);
    } finally {
      await reopened.close(BACKGROUND_CONTEXT);
    }
  });

  test('seeds selected instructions and replaces the entire applicable set on the next configuration', async () => {
    const runtime = await PiDurableRuntime.open(new MemoryStorage(), options());
    try {
      const initial = [
        { key: 'skill:selected', text: 'Selected body.' },
        { key: 'skill:previous', text: 'Previous body.' },
      ];
      const conversation = await runtime.ensureConversation({
        ...seed,
        initialInstructions: initial,
      });
      const read = () =>
        conversation.commit(
          async (tx) =>
            (await tx.doc(ToolInstructions, conversation.id)).sections.map(({ key, text }) => ({
              key,
              text,
            })),
          BACKGROUND_CONTEXT,
        );
      expect(await read()).toEqual(initial);
      const current = [{ key: 'skill:selected', text: 'Adapted body.' }];
      await runtime.configure(
        seed.sessionId,
        seed.agent,
        {},
        BACKGROUND_CONTEXT,
        undefined,
        current,
      );
      expect(await read()).toEqual(current);
    } finally {
      await runtime.close();
    }
  });
  test('refuses the earlier authoritative binding and preserves its history for explicit migration', async () => {
    class ReopenableStorage extends MemoryStorage {
      override async close() {}
    }
    const storage = new ReopenableStorage();
    const oldBinding = defineDocFamily<{ conversationId: ConversationId | null }, null>({
      kind: 'cherry.session',
      version: 1,
      scope: 'session',
      checkpointWhen: () => false,
      family: true,
      initial: () => ({ conversationId: null }),
    });
    const old = await Harness.open(storage, options(), BACKGROUND_CONTEXT);
    const id = await old.commit(async (tx) => {
      const binding = await tx.doc(oldBinding, seed.sessionId, null);
      const conversation = await tx.createConversation({ ownership: { kind: 'ownerless' } });
      await tx.appendEntry(conversation.id, seed.entries[0]!);
      binding.conversationId = conversation.id;
      return conversation.id;
    }, BACKGROUND_CONTEXT);
    await old.close(BACKGROUND_CONTEXT);
    const runtime = await PiDurableRuntime.open(storage, options());
    try {
      await expect(runtime.sessions()).rejects.toThrow('predates Cherry-owned transcripts');
      const history = await storage.scanEntries(
        { conversationId: id },
        10,
        undefined,
        BACKGROUND_CONTEXT,
      );
      expect(history.items[0]?.model).toEqual(seed.entries[0]?.model);
    } finally {
      await runtime.close();
    }
  });

  test('history correlation scans each source once and follows later native submission commits', async () => {
    const storage = new MemoryStorage();
    const runtime = await PiDurableRuntime.open(storage, options());
    try {
      const conversation = await runtime.ensureConversation(seed);
      const scan = jest.spyOn(storage, 'scanSubmissions');
      await runtime.history(seed.sessionId, 1);
      const metadata = { userMessageId: 'user', assistantMessageId: 'assistant' };
      const input = await runtime.submit(
        seed.sessionId,
        { type: 'input', requestId: 'new', content: 'Continue' },
        metadata,
      );
      const record = await input.wait(BACKGROUND_CONTEXT);
      const history = await runtime.history(seed.sessionId, 256);
      expect(history.submissions).toContainEqual({ record, metadata });
      await runtime.history(seed.sessionId, 1);
      expect(
        scan.mock.calls.filter(([query]) => query.conversationId === conversation.id),
      ).toHaveLength(1);
      expect(await runtime.withdrawInput(seed.sessionId, 'new')).toBe('settled');
      expect(await runtime.withdrawInput(seed.sessionId, 'missing')).toBe('not_found');
      expect(await runtime.sessions()).toEqual([
        { sessionId: seed.sessionId, binding: await runtime.binding(seed.sessionId) },
      ]);
    } finally {
      await runtime.close();
    }
  });

  test('commits metadata and layout before native admission; failed admission leaves no queue item and retry deduplicates', async () => {
    const storage = new MemoryStorage();
    const runtime = await PiDurableRuntime.open(storage, options());
    const layout = {
      version: 1,
      renderer: 'plain-v1',
      contentKind: 'string',
      spans: [{ partId: 'body', start: 0, end: 8 }],
    };
    const metadata = {
      authoredTextLayout: layout,
      userMessageId: 'user',
      assistantMessageId: 'answer',
    };
    const draft = {
      type: 'input' as const,
      requestId: 'metadata-first',
      content: 'Continue',
      whenBusy: 'followUp' as const,
    };
    let native: jest.SpyInstance | undefined;
    try {
      const conversation = await runtime.ensureConversation(seed);
      const prototype = Object.getPrototypeOf(conversation) as {
        submit: typeof conversation.submit;
      };
      const original = prototype.submit;
      native = jest.spyOn(prototype, 'submit').mockImplementationOnce(async () => {
        // Native admission observes the already committed provenance document.
        const family = defineDocFamily<{ value: JsonObject }, JsonObject>({
          kind: 'cherry.submission',
          version: 1,
          scope: 'session',
          checkpointWhen: () => false,
          family: true,
          initial: (value) => ({ value }),
        });
        expect(
          await conversation.commit(
            async (tx) =>
              JSON.parse(
                JSON.stringify(
                  (await tx.doc(family, `${conversation.id}:${draft.requestId}`, {})).value,
                ),
              ),
            BACKGROUND_CONTEXT,
          ),
        ).toEqual(metadata);
        expect(await runtime.inputRecord(seed.sessionId, draft.requestId)).toBeUndefined();
        throw new Error('Native admission unavailable');
      });
      await expect(runtime.submit(seed.sessionId, draft, metadata)).rejects.toThrow(
        'Native admission unavailable',
      );
      expect(await runtime.readQueuedInputs(seed.sessionId)).toEqual([]);
      native.mockImplementation(original);
      const first = await runtime.submit(seed.sessionId, draft, metadata);
      const retry = await runtime.submit(seed.sessionId, draft, metadata);
      expect(retry.id).toBe(first.id);
      expect(await runtime.submissionMetadata(await first.status(BACKGROUND_CONTEXT))).toEqual(
        metadata,
      );
    } finally {
      native?.mockRestore();
      await runtime.close();
    }
  });

  test('native admission deduplicates retries and keeps immutable display identities', async () => {
    const runtime = await PiDurableRuntime.open(new MemoryStorage(), options());
    const metadata = { userMessageId: 'user', assistantMessageId: 'assistant', version: 1 };
    const draft = { type: 'input' as const, requestId: 'request', content: 'Continue' };
    try {
      await runtime.ensureConversation(seed);
      const [first, repeated] = await Promise.all([
        runtime.submit(seed.sessionId, draft, metadata),
        runtime.submit(seed.sessionId, draft, {
          version: 1,
          assistantMessageId: 'assistant',
          userMessageId: 'user',
        }),
      ]);
      expect(first.id).toBe(repeated.id);
      const record = await first.wait(BACKGROUND_CONTEXT);
      expect(record.status).toBe('unanswered'); // No model is registered in this storage-only fixture.
      if (record.entry === undefined) throw new Error('Expected a durably placed user input');
      expect(await runtime.submissionMetadata(record)).toEqual(metadata);
      await expect(
        runtime.submit(seed.sessionId, draft, { ...metadata, userMessageId: 'different-user' }),
      ).rejects.toThrow('different display metadata');
      const sourceHistory = await runtime.history(seed.sessionId, 256);
      expect(sourceHistory.entries.filter((entry) => entry.kind === UserEntry.kind)).toHaveLength(
        2,
      );
    } finally {
      await runtime.close();
    }
  });

  test('reset changes model context while full history remains available and paginates without loss', async () => {
    const runtime = await PiDurableRuntime.open(new MemoryStorage(), options());
    try {
      const conversation = await runtime.ensureConversation(seed);
      await conversation.reset('Start a fresh subject.', BACKGROUND_CONTEXT);
      expect((await conversation.context(BACKGROUND_CONTEXT)).messages).toEqual([
        expect.objectContaining({ content: 'Start a fresh subject.' }),
      ]);
      const first = await runtime.history(seed.sessionId, 1);
      expect(first.next).toBeDefined();
      const second = await runtime.history(seed.sessionId, 1, first.next);
      expect(second.entries).toEqual([
        expect.objectContaining({ kind: UserEntry.kind, model: seed.entries[0]?.model }),
      ]);
      expect(second.next).toBeUndefined();
    } finally {
      await runtime.close();
    }
  });

  test('request options survive reconfiguration without persisting credentials', async () => {
    const runtime = await PiDurableRuntime.open(new MemoryStorage(), options());
    try {
      const source = await runtime.ensureConversation(seed);
      const selected = { maxOutputTokens: 512, temperature: 0.3, apiKey: 'must-not-persist' };
      await runtime.configure(seed.sessionId, seed.agent, selected);
      const affinity = await source.commit(
        async (tx) => (await tx.doc(ProviderDoc, source.id)).sessionId,
        BACKGROUND_CONTEXT,
      );
      expect(await runtime.requestOptions(affinity)).toEqual({
        maxOutputTokens: 512,
        temperature: 0.3,
      });
      await expect(runtime.requestOptions('unknown-affinity')).rejects.toThrow(
        'no application configuration',
      );
    } finally {
      await runtime.close();
    }
  });

  test('concurrent continuation creates one conversation and imports history once without execution', async () => {
    const runtime = await PiDurableRuntime.open(new MemoryStorage(), options());
    try {
      const [first, second] = await Promise.all([
        runtime.ensureConversation(seed),
        runtime.ensureConversation(seed),
      ]);
      expect(first.id).toBe(second.id);
      const history = await first.context(BACKGROUND_CONTEXT);
      expect(history.messages).toEqual(seed.entries[0]?.model);
      expect(await runtime.binding(seed.sessionId)).toMatchObject({
        conversationId: first.id,
        revision: seed.revision,
      });
      expect(await runtime.inspect()).toMatchObject({
        scheduling: 'paused',
        tasks: [],
        submissions: [],
      });
    } finally {
      await runtime.close();
    }
  });

  test('failed creation leaves no binding or imported history and can be retried', async () => {
    let fail = true;
    const runtime = await PiDurableRuntime.open(new MemoryStorage(), {
      ...options(),
      conversationCreated: () => {
        if (fail) throw new Error('preparation failed');
      },
    });
    try {
      await expect(runtime.ensureConversation(seed)).rejects.toThrow('preparation failed');
      expect(await runtime.binding(seed.sessionId)).toBeUndefined();
      fail = false;
      const conversation = await runtime.ensureConversation(seed);
      const history = await conversation.context(BACKGROUND_CONTEXT);
      expect(history.messages).toEqual(seed.entries[0]?.model);
    } finally {
      await runtime.close();
    }
  });

  test('retiring a working copy allows a fresh revision without inheriting deleted history', async () => {
    const runtime = await PiDurableRuntime.open(new MemoryStorage(), options());
    try {
      const first = await runtime.ensureConversation(seed);
      await runtime.retireSession(seed.sessionId);
      expect(await runtime.conversation(seed.sessionId)).toBeUndefined();
      const rebuilt = await runtime.ensureConversation({ ...seed, revision: 1, entries: [] });
      expect(rebuilt.id).not.toBe(first.id);
      expect((await rebuilt.context(BACKGROUND_CONTEXT)).messages).toEqual([]);
      expect(await runtime.binding(seed.sessionId)).toMatchObject({ revision: 1 });
      await expect(runtime.ensureConversation(seed)).rejects.toThrow('obsolete');
    } finally {
      await runtime.close();
    }
  });
});

const TestSubmissionMetadata = defineDocFamily<{ value: JsonObject }, JsonObject>({
  kind: 'cherry.submission',
  version: 1,
  scope: 'session',
  family: true,
  checkpointWhen: () => false,
  initial: (value) => ({ value }),
});

async function queueFixture(text = 'B', legacy = false) {
  const storage = new MemoryStorage();
  const runtime = await PiDurableRuntime.open(storage, options());
  const conversation = await runtime.ensureConversation({ ...seed, entries: [] });
  const records = [];
  for (const name of ['B', 'C', 'D']) {
    const body = name === 'B' ? text : name;
    const serialized = serializePiUserContent([{ type: 'text', text: body, partId: 'body' }], {
      image: false,
      video: false,
      audio: false,
    });
    const value = {
      kind: 'cherry.input',
      version: 1,
      requestId: name,
      turnId: name,
      userMessageId: `user-${name}`,
      assistantMessageId: `assistant-${name}`,
      createdAt: 1,
      tools: [],
      unknownEnvelope: { retained: true },
      metadata: {
        parentMessageId: name === 'B' ? 'assistant-A' : `assistant-${name === 'C' ? 'B' : 'C'}`,
        userParts: [{ id: 'body', type: 'text', text: body, state: 'done' }],
        captured: 'keep',
      },
      ...(!legacy ? { authoredTextLayout: serialized.layout } : {}),
    } as JsonObject;
    records.push(
      await conversation.commit(async (tx) => {
        const inbox = await tx.doc(InboxDoc, conversation.id);
        await tx.doc(TestSubmissionMetadata, `${conversation.id}:${name}`, value);
        const record = await tx.createSubmission({
          conversationId: conversation.id,
          requestId: name,
          type: 'input',
          status: 'queued',
        });
        inbox.items.push({ id: record.id, mode: 'followUp', content: serialized.content });
        return record;
      }, BACKGROUND_CONTEXT),
    );
  }
  const edit: RuntimeEditQueuedInput = {
    requestId: 'B',
    assistantMessageId: 'assistant-B',
    mutationId: 'edit-1',
    parts: [
      {
        partId: 'body',
        expectedText: text,
        text: 'edited B',
        expectedRenderedText: text,
        renderedText: 'edited B',
      },
    ],
  };
  return {
    runtime,
    storage,
    conversation,
    records,
    edit,
    inbox: () =>
      conversation.commit(
        async (tx) => JSON.parse(JSON.stringify(await tx.doc(InboxDoc, conversation.id))),
        BACKGROUND_CONTEXT,
      ),
  };
}

test('plain image provenance uses authored text while retaining expanded render data in the command', async () => {
  const f = await queueFixture();
  try {
    await f.conversation.commit(async (tx) => {
      const metadata = await tx.doc(TestSubmissionMetadata, `${f.conversation.id}:B`, {});
      (metadata.value.authoredTextLayout as JsonObject).renderer = 'plain-v1';
    }, BACKGROUND_CONTEXT);
    const edited = {
      ...f.edit,
      parts: f.edit.parts.map((part) => ({
        ...part,
        expectedRenderedText: 'B plus retained plugin intent',
        renderedText: 'edited B plus retained plugin intent',
      })),
    };
    await expect(f.runtime.editQueuedInput(seed.sessionId, edited)).resolves.toEqual({
      status: 'updated',
    });
    const queued = await f.conversation.commit(
      async (tx) => JSON.parse(JSON.stringify(await tx.doc(InboxDoc, f.conversation.id))),
      BACKGROUND_CONTEXT,
    );
    expect(queued?.items[0]).toMatchObject({ content: 'edited B' });
  } finally {
    await f.runtime.close();
  }
});

test('edits inbox and nested display parts atomically, preserves envelope, and deduplicates ABA retries', async () => {
  const fixture = await queueFixture();
  const { runtime, storage, records, edit } = fixture;
  try {
    const commit = jest.spyOn(storage, 'commit');
    expect(await runtime.editQueuedInput(seed.sessionId, edit)).toEqual({ status: 'updated' });
    expect(
      commit.mock.calls.some(
        ([writes]) =>
          writes.filter(
            (write) => write.type === 'document.change' || write.type === 'document.create',
          ).length >= 3,
      ),
    ).toBe(true);
    expect((await fixture.inbox()).items[0].content).toBe('edited B');
    const metadata = await runtime.submissionMetadata(records[0]!);
    expect(metadata).toMatchObject({
      unknownEnvelope: { retained: true },
      metadata: {
        captured: 'keep',
        userParts: [{ id: 'body', text: 'edited B' }],
      },
      authoredTextLayout: { spans: [{ partId: 'body', start: 0, end: 8 }] },
    });
    expect(
      await runtime.editQueuedInput(seed.sessionId, {
        ...edit,
        mutationId: 'restore',
        parts: [
          {
            ...edit.parts[0]!,
            expectedText: 'edited B',
            expectedRenderedText: 'edited B',
            text: 'B',
            renderedText: 'B',
          },
        ],
      }),
    ).toEqual({ status: 'updated' });
    expect(await runtime.editQueuedInput(seed.sessionId, edit)).toEqual({
      status: 'unchanged',
      reason: 'already-applied',
    });
    expect((await fixture.inbox()).items[0].content).toBe('B');
    expect(
      await runtime.editQueuedInput(seed.sessionId, {
        ...edit,
        parts: [{ ...edit.parts[0]!, text: 'other' }],
      }),
    ).toEqual({ status: 'conflict', reason: 'mutation-id-reused' });
  } finally {
    await runtime.close();
  }
});

test('moves one adjacent item, repairs waiting parents, preserves identities and rejects edges and stale neighbors', async () => {
  const f = await queueFixture();
  const move = {
    requestId: 'D',
    assistantMessageId: 'assistant-D',
    mutationId: 'move-1',
    direction: 'earlier' as const,
    expectedNeighborAssistantMessageId: 'assistant-C',
  };
  try {
    const before = (await f.inbox()).items;
    expect(await f.runtime.moveQueuedInput(seed.sessionId, move)).toEqual({ status: 'moved' });
    expect((await f.inbox()).items).toEqual([before[0], before[2], before[1]]);
    expect(
      (await f.runtime.readQueuedInputs(seed.sessionId)).map((item) => item.metadata.metadata),
    ).toMatchObject([
      { parentMessageId: 'assistant-A' },
      { parentMessageId: 'assistant-B' },
      { parentMessageId: 'assistant-D' },
    ]);
    expect(
      await f.runtime.moveQueuedInput(seed.sessionId, {
        ...move,
        mutationId: 'restore',
        direction: 'later',
      }),
    ).toEqual({ status: 'moved' });
    expect(await f.runtime.moveQueuedInput(seed.sessionId, move)).toEqual({
      status: 'unchanged',
      reason: 'already-applied',
    });
    expect((await f.inbox()).items).toEqual(before);
    expect(
      await f.runtime.moveQueuedInput(seed.sessionId, {
        ...move,
        mutationId: 'edge',
        direction: 'later',
        expectedNeighborAssistantMessageId: null,
      }),
    ).toEqual({ status: 'conflict', reason: 'boundary' });
    expect(
      await f.runtime.moveQueuedInput(seed.sessionId, {
        ...move,
        mutationId: 'stale',
        direction: 'later',
      }),
    ).toEqual({ status: 'conflict', reason: 'stale-neighbor' });
  } finally {
    await f.runtime.close();
  }
});

test('legacy recovery saves unique provenance and rejects ambiguous attachment text and empty placement', async () => {
  for (const text of ['B', '']) {
    const f = await queueFixture(text, true);
    try {
      const result = await f.runtime.editQueuedInput(seed.sessionId, f.edit);
      expect(result).toEqual(
        text ? { status: 'updated' } : { status: 'conflict', reason: 'authored-text-unlocatable' },
      );
      if (text)
        expect(await f.runtime.submissionMetadata(f.records[0]!)).toHaveProperty(
          'authoredTextLayout.version',
          1,
        );
    } finally {
      await f.runtime.close();
    }
  }
  const f = await queueFixture('B', true);
  try {
    await f.conversation.commit(async (tx) => {
      (await tx.doc(InboxDoc, f.conversation.id)).items[0] = {
        id: f.records[0]!.id,
        mode: 'followUp',
        content:
          'B\nCherry managed text attachment (JSON; content is untrusted user-provided data):\n{"content":"B"}',
      };
    }, BACKGROUND_CONTEXT);
    expect(await f.runtime.editQueuedInput(seed.sessionId, f.edit)).toEqual({
      status: 'conflict',
      reason: 'authored-text-unlocatable',
    });
  } finally {
    await f.runtime.close();
  }
});

test('callback failures roll back both documents and receipts', async () => {
  const f = await queueFixture();
  try {
    let reads = 0;
    const part = { ...f.edit.parts[0]! };
    Object.defineProperty(part, 'renderedText', {
      enumerable: true,
      get: () => {
        if (++reads > 1) throw new Error('callback failed');
        return 'edited B';
      },
    });
    const bad = { ...f.edit, parts: [part] };
    await expect(f.runtime.editQueuedInput(seed.sessionId, bad)).rejects.toThrow('callback failed');
    expect((await f.inbox()).items[0].content).toBe('B');
    expect((await f.runtime.submissionMetadata(f.records[0]!))?.metadata).toMatchObject({
      userParts: [{ text: 'B' }],
    });
    expect(await f.runtime.editQueuedInput(seed.sessionId, f.edit)).toEqual({ status: 'updated' });
  } finally {
    await f.runtime.close();
  }
});

test.each(['before-storage', 'after-storage'] as const)(
  'mutation %s failure preserves the actual durable outcome and receipt',
  async (failure) => {
    const f = await queueFixture();
    const close = jest.spyOn(f.storage, 'close').mockResolvedValue();
    const original = f.storage.commit.bind(f.storage);
    const commit = jest
      .spyOn(f.storage, 'commit')
      .mockImplementationOnce(async (writes, context) => {
        if (failure === 'after-storage') await original(writes, context);
        throw new Error('storage acknowledgment failed');
      });
    await expect(f.runtime.editQueuedInput(seed.sessionId, f.edit)).rejects.toThrow();
    commit.mockRestore();
    await f.runtime.close();
    const reopened = await PiDurableRuntime.open(f.storage, options());
    try {
      const queue = await reopened.readQueuedInputs(seed.sessionId);
      expect(queue[0]?.metadata.metadata).toMatchObject({
        userParts: [{ text: failure === 'after-storage' ? 'edited B' : 'B' }],
      });
      expect(await reopened.editQueuedInput(seed.sessionId, f.edit)).toEqual(
        failure === 'after-storage'
          ? { status: 'unchanged', reason: 'already-applied' }
          : { status: 'updated' },
      );
    } finally {
      await reopened.close();
      close.mockRestore();
      await f.storage.close(BACKGROUND_CONTEXT);
    }
  },
);

test('failed in-memory adoption after storage commit is recovered through the durable receipt', async () => {
  const f = await queueFixture();
  // Test-only fault injection at Pi's post-storage adoption boundary; no private state writes.
  const prototype = await f.conversation.commit(
    async (tx) =>
      Object.getPrototypeOf(tx) as {
        adopt(seq: unknown): unknown;
      },
    BACKGROUND_CONTEXT,
  );
  const adoption = jest.spyOn(prototype, 'adopt').mockImplementationOnce(() => {
    throw new Error('adoption failed');
  });
  const close = jest.spyOn(f.storage, 'close').mockResolvedValue();
  try {
    await expect(f.runtime.editQueuedInput(seed.sessionId, f.edit)).rejects.toThrow(
      'adoption failed',
    );
    adoption.mockRestore();
    await f.runtime.close();
    const reopened = await PiDurableRuntime.open(f.storage, options());
    try {
      expect((await reopened.readQueuedInputs(seed.sessionId))[0]?.metadata.metadata).toMatchObject(
        { userParts: [{ text: 'edited B' }] },
      );
      expect(await reopened.editQueuedInput(seed.sessionId, f.edit)).toEqual({
        status: 'unchanged',
        reason: 'already-applied',
      });
    } finally {
      await reopened.close();
    }
  } finally {
    adoption.mockRestore();
    close.mockRestore();
    await f.storage.close(BACKGROUND_CONTEXT);
  }
});

test('a swap preserves unrelated inbox positions and rejects an unprovable adjacent lane', async () => {
  const f = await queueFixture();
  try {
    await f.conversation.commit(async (tx) => {
      const inbox = await tx.doc(InboxDoc, f.conversation.id);
      const unrelated = await tx.createSubmission({
        conversationId: f.conversation.id,
        type: 'write',
        status: 'queued',
      });
      inbox.items.unshift({
        id: unrelated.id,
        mode: 'write',
        entry: { kind: 'unrelated', data: { keep: true } },
      });
    }, BACKGROUND_CONTEXT);
    const before = (await f.inbox()).items;
    expect(
      await f.runtime.moveQueuedInput(seed.sessionId, {
        requestId: 'D',
        assistantMessageId: 'assistant-D',
        mutationId: 'swap',
        direction: 'earlier',
        expectedNeighborAssistantMessageId: 'assistant-C',
      }),
    ).toEqual({ status: 'moved' });
    expect((await f.inbox()).items).toEqual([before[0], before[1], before[3], before[2]]);
    expect(
      await f.runtime.moveQueuedInput(seed.sessionId, {
        requestId: 'B',
        assistantMessageId: 'assistant-B',
        mutationId: 'foreign',
        direction: 'earlier',
        expectedNeighborAssistantMessageId: 'unknown',
      }),
    ).toEqual({ status: 'conflict', reason: 'different-lane' });
  } finally {
    await f.runtime.close();
  }
});

test.each([false, true])(
  'edits interleaved spans right-to-left while freezing attachments and images=%s',
  async (blocks) => {
    const f = await queueFixture();
    const attachment = {
      type: 'text-attachment' as const,
      fileEntryId: 'file',
      name: 'f.txt',
      mediaType: 'text/plain',
      trust: 'untrusted-user-content' as const,
      text: 'B repeats B',
      truncated: false,
    };
    const serialized = serializePiUserContent(
      [
        { type: 'text', partId: 'body', text: 'B' },
        attachment,
        ...(blocks
          ? [{ type: 'file' as const, uri: 'data:image/png;base64,eA==', mediaType: 'image/png' }]
          : []),
        { type: 'text', partId: 'second', text: '😀 Z' },
        { type: 'text', partId: 'empty', text: '' },
      ],
      { image: true, video: false, audio: false },
    );
    try {
      await f.conversation.commit(async (tx) => {
        const inbox = await tx.doc(InboxDoc, f.conversation.id);
        const document = await tx.doc(TestSubmissionMetadata, `${f.conversation.id}:B`, {});
        const item = inbox.items[0]!;
        if (item.mode === 'write') throw new Error('Expected input');
        item.content = serialized.content;
        document.value.authoredTextLayout = serialized.layout!;
        (document.value.metadata as JsonObject).userParts = [
          { id: 'body', type: 'text', text: 'B', state: 'done' },
          { id: 'file', type: 'file', fileEntryId: 'file', mediaType: 'text/plain' },
          { id: 'second', type: 'text', text: '😀 Z', state: 'done' },
          { id: 'empty', type: 'text', text: '', state: 'done' },
        ];
      }, BACKGROUND_CONTEXT);
      expect(
        await f.runtime.editQueuedInput(seed.sessionId, {
          ...f.edit,
          parts: [
            { ...f.edit.parts[0]!, text: 'longer B', renderedText: 'longer B' },
            {
              partId: 'second',
              expectedText: '😀 Z',
              expectedRenderedText: '😀 Z',
              text: '',
              renderedText: '',
            },
            {
              partId: 'empty',
              expectedText: '',
              expectedRenderedText: '',
              text: 'tail',
              renderedText: 'tail',
            },
          ],
        }),
      ).toEqual({ status: 'updated' });
      const expected = serializePiUserContent(
        [
          { type: 'text', partId: 'body', text: 'longer B' },
          attachment,
          ...(blocks
            ? [{ type: 'file' as const, uri: 'data:image/png;base64,eA==', mediaType: 'image/png' }]
            : []),
          { type: 'text', partId: 'second', text: '' },
          { type: 'text', partId: 'empty', text: 'tail' },
        ],
        { image: true, video: false, audio: false },
      );
      expect((await f.inbox()).items[0].content).toEqual(expected.content);
      expect((await f.runtime.submissionMetadata(f.records[0]!))?.authoredTextLayout).toEqual(
        expected.layout,
      );
    } finally {
      await f.runtime.close();
    }
  },
);

test('invalid persisted provenance never falls back to legacy text guessing', async () => {
  const f = await queueFixture();
  try {
    await f.conversation.commit(async (tx) => {
      (
        await tx.doc(TestSubmissionMetadata, `${f.conversation.id}:B`, {})
      ).value.authoredTextLayout = {
        version: 2,
        renderer: 'future',
        contentKind: 'string',
        spans: [],
      };
    }, BACKGROUND_CONTEXT);
    expect(await f.runtime.editQueuedInput(seed.sessionId, f.edit)).toEqual({
      status: 'conflict',
      reason: 'invalid-text-layout',
    });
    expect((await f.inbox()).items[0].content).toBe('B');
  } finally {
    await f.runtime.close();
  }
});
