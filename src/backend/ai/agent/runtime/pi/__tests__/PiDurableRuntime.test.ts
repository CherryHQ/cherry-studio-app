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
} from '@earendil-works/pi-durable';

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
      await runtime.reset(seed.sessionId, 'Start a fresh subject.');
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
