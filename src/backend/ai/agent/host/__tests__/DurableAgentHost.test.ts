import { v7 as uuid } from 'uuid';

import type { AgentEvent, AgentInferenceSnapshotV1 } from '@/shared/contracts/agent';
import { createUniqueModelId } from '@/shared/data/types/model';

import {
  FakeRuntime,
  type DurableAgentRuntime,
  type RuntimeConversationEvent,
  type RuntimeDurableTurn,
  type RuntimeExecutionPorts,
} from '../../runtime';
import { InMemoryAgentSessionStore } from '../../sessionStore/InMemoryAgentSessionStore';
import { DurableAgentHost } from '../DurableAgentHost';
import type { MobileAgentHostPorts } from '../MobileAgentHost';

const inferenceSnapshot: AgentInferenceSnapshotV1 = {
  version: 1,
  model: {
    uniqueModelId: createUniqueModelId('provider', 'model'),
    providerId: 'provider',
    modelId: 'model',
    name: 'Model',
  },
  parameters: {},
  tools: [],
};
const configuration = {
  model: { providerId: 'provider', modelId: 'model' },
  instructions: '',
  options: {},
  tools: [],
};

function fixture(overrides: Partial<MobileAgentHostPorts> = {}) {
  const store = new InMemoryAgentSessionStore();
  const agentId = uuid();
  const sessionId = uuid();
  const steps: string[] = [];
  const copies = new Map<string, { revision: number; turns: RuntimeDurableTurn[] }>();
  const listeners = new Map<string, (event: RuntimeConversationEvent) => void>();
  let execution: RuntimeExecutionPorts | undefined;
  const emit = (turn: RuntimeDurableTurn) => {
    const copy = copies.get(turn.identity.sessionId)!;
    copy.turns = [
      ...copy.turns.filter((item) => item.identity.requestId !== turn.identity.requestId),
      turn,
    ];
    listeners.get(turn.identity.sessionId)?.({ type: 'turn.updated', turn });
  };
  const conversations: DurableAgentRuntime = {
    descriptor: new FakeRuntime().descriptor,
    preflightModel: async () => ({
      contextWindow: 32768,
      maxInputTokens: 28672,
      maxOutputTokens: 4096,
      inputModalities: ['text'],
      supportsTools: true,
    }),
    initialize: jest.fn(async (_database, ports) => {
      execution = ports;
      steps.push('open');
    }),
    resume: jest.fn(() => {
      steps.push('resume');
    }),
    close: jest.fn(async () => {
      steps.push('close');
    }),
    sessions: async () =>
      [...copies].map(([sessionId, copy]) => ({ sessionId, revision: copy.revision })),
    revision: async (id) => copies.get(id)?.revision,
    hasConversation: async (id) => copies.has(id),
    unfinishedSessions: async () =>
      [...copies]
        .filter(([, copy]) =>
          copy.turns.some((turn) => ['running', 'queued'].includes(turn.status)),
        )
        .map(([id]) => id),
    hasUnfinishedWork: async () => (await conversations.unfinishedSessions()).length > 0,
    watchWork: async () => ({ active: false, unsubscribe: async () => {} }),
    configuration: async () => configuration,
    configure: async () => {},
    resourceFileEntryIds: async () => [],
    ensureConversation: async (seed) => {
      copies.set(seed.sessionId, { revision: seed.revision, turns: [] });
    },
    submit: jest.fn(async (id, input) => {
      expect(
        (await store.listMessages(id)).find((message) => message.id === input.assistantMessageId)
          ?.status,
      ).toBe('pending');
      const turn: RuntimeDurableTurn = {
        identity: { sessionId: id, turnId: input.turnId, requestId: input.requestId },
        userMessageId: input.userMessageId,
        assistantMessageId: input.assistantMessageId,
        inputBoundary: 'pi:1',
        answerBoundary: null,
        metadata: input.metadata,
        status: 'running',
        parts: [],
        usage: null,
        error: null,
        hasAssistant: true,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      };
      emit(turn);
      return turn;
    }),
    observe: async (id, listener) => {
      listeners.set(id, listener);
      const turns = copies.get(id)?.turns ?? [];
      return {
        snapshot: {
          activeTurn: turns.find((turn) => turn.status === 'running') ?? null,
          queue: turns.filter((turn) => turn.status === 'queued'),
        },
        unsubscribe: async () => {
          listeners.delete(id);
        },
      };
    },
    history: async (id, query) => ({
      turns: (copies.get(id)?.turns ?? [])
        .toReversed()
        .filter((turn) => !query.requestIds || query.requestIds.includes(turn.identity.requestId))
        .slice(0, query.limit),
    }),
    message: async (id, messageId) => {
      const turn = copies
        .get(id)
        ?.turns.find(
          (turn) => turn.assistantMessageId === messageId || turn.userMessageId === messageId,
        );
      return turn
        ? { turn, role: turn.assistantMessageId === messageId ? 'assistant' : 'user' }
        : undefined;
    },
    exportTurn: async () => ({ contextCheckpoint: null }),
    drainUsage: async () => {
      steps.push('usage');
    },
    abort: jest.fn(async (id) => {
      for (const turn of copies.get(id)?.turns ?? [])
        if (['queued', 'running'].includes(turn.status)) emit({ ...turn, status: 'cancelled' });
    }),
    discardConversation: jest.fn(async (id) => {
      copies.delete(id);
      steps.push('discard');
    }),
    withdraw: async () => 'aborted',
  };
  const ports: MobileAgentHostPorts = {
    agents: {
      getAgent: async (id) =>
        id === agentId
          ? {
              id,
              name: 'Agent',
              instructions: '',
              model: configuration.model,
              options: {},
              toolApprovalMode: 'default',
              disabledCapabilities: [],
            }
          : null,
    },
    appLanguage: () => 'zh-CN',
    documentParserMode: () => 'builtin',
    files: {
      resolveAvailable: async () => new Map(),
      readAsBytes: async () => undefined,
      readDocumentText: async () => undefined,
      readAsDataUrl: async () => undefined,
    },
    inferenceModel: async (model) => ({
      ...model,
      apiModelId: model.modelId,
      name: 'Model',
      uniqueModelId: createUniqueModelId(model.providerId, model.modelId),
    }),
    runtimeTools: { resolve: async () => ({ tools: [], pluginGuides: [] }) },
    tools: { getTools: async () => [] },
    usage: { record: jest.fn(), drain: async () => {} },
    naming: () => ({
      drain: async () => {},
      maybeRenameFromFirstUserMessage: async () => null,
      maybeRenameFromConversationSummary: async () => null,
    }),
    durableStorage: {
      open: async () => ({}) as never,
      notifyTranscript: () => {
        steps.push('persisted');
      },
    },
    recordDurableUsage: async () => {},
    ...overrides,
  };
  const background = {
    acquirePreparation: () => ({ release() {} }),
    clearSession() {},
    updateSessionTitle() {},
    startTurn: () => ({
      updateContent() {},
      awaitApproval() {},
      finish() {},
      retire() {},
      update() {},
    }),
  };
  const host = new DurableAgentHost(store, ports, background, new FakeRuntime(), conversations);
  const reserve = async (status: RuntimeDurableTurn['status'] = 'completed') => {
    const reserved = await store.reserveInitialSubmission({
      sessionId,
      agentId,

      userMessageId: uuid(),
      assistantMessageId: uuid(),
      userParts: [{ id: 'question', type: 'text', text: 'Question', state: 'done' }],
      modelId: inferenceSnapshot.model.uniqueModelId,
      inferenceSnapshot,
    });
    const turn: RuntimeDurableTurn = {
      identity: { sessionId, turnId: reserved.turnId, requestId: reserved.turnId },
      userMessageId: reserved.userMessage.id,
      assistantMessageId: reserved.assistantMessage.id,
      inputBoundary: 'pi:1',
      answerBoundary: 'pi:2',
      status,
      hasAssistant: true,
      usage: null,
      error: null,
      createdAt: 20,
      updatedAt: 30,
      parts: [
        { id: 'reasoning', type: 'reasoning', text: 'Reasoning', state: 'done' },
        { id: 'answer', type: 'text', text: 'Answer', state: 'done' },
      ],
      metadata: {
        userParts: reserved.userMessage.parts as never,
        referencedFileEntryIds: [],
        hasHistoryBeforeActiveTurn: false,
        inferenceSnapshot,
      },
    };
    copies.set(sessionId, { revision: 0, turns: [turn] });
    return turn;
  };
  return {
    host,
    store,
    conversations,
    sessionId,
    agentId,
    steps,
    copies,
    emit,
    reserve,
    execution: () => execution,
  };
}

describe('Cherry-owned transcript and disposable execution recovery', () => {
  test('interrupts a reservation when observation fails before native admission', async () => {
    const state = fixture();
    await state.host.initialize();
    jest.spyOn(state.conversations, 'observe').mockRejectedValueOnce(new Error('watch failed'));
    try {
      await expect(
        state.host.startSession({
          sessionId: state.sessionId,
          agentId: state.agentId,

          userMessageId: uuid(),
          assistantMessageId: uuid(),
          parts: [{ type: 'text', text: 'Hello' }],
        }),
      ).rejects.toThrow('watch failed');
      expect(state.conversations.submit).not.toHaveBeenCalled();
      expect((await state.store.listMessages(state.sessionId)).at(-1)?.status).toBe('interrupted');
    } finally {
      await state.host.close();
    }
  });

  test('background native work prevents backup even without an active answer', async () => {
    const state = fixture();
    jest.spyOn(state.conversations, 'hasUnfinishedWork').mockResolvedValue(true);
    await state.host.initialize();
    try {
      await expect(state.host.quiesce()).rejects.toMatchObject({ code: 'busy' });
    } finally {
      await state.host.close();
    }
  });

  test('a delayed settlement cannot replace the status of the next running queued input', async () => {
    const state = fixture();
    const first = await state.reserve('running');
    await state.host.initialize();
    let release!: () => void;
    let started!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const finalize = state.store.finalizeAssistantMessage.bind(state.store);
    jest.spyOn(state.store, 'finalizeAssistantMessage').mockImplementationOnce(async (input) => {
      started();
      await blocked;
      return finalize(input);
    });
    const events: AgentEvent[] = [];
    await state.host.observeSession(state.sessionId, (event) => events.push(event));
    state.emit({ ...first, status: 'completed' });
    await entered;
    const reserved = await state.store.reserveSubmission({
      sessionId: state.sessionId,
      userMessageId: uuid(),
      assistantMessageId: uuid(),
      userParts: [{ id: 'next', type: 'text', text: 'Next question', state: 'done' }],
      modelId: inferenceSnapshot.model.uniqueModelId,
      inferenceSnapshot,
    });
    state.emit({
      ...first,
      identity: { sessionId: state.sessionId, turnId: reserved.turnId, requestId: reserved.turnId },
      userMessageId: reserved.userMessage.id,
      assistantMessageId: reserved.assistantMessage.id,
      status: 'running',
      parts: [],
    });
    release();
    await state.host.close();
    expect(state.host.getSessionStatus(state.sessionId)).toEqual({
      turnId: reserved.turnId,
      status: 'running',
    });
    expect(events.filter((event) => event.type === 'message.finalized')).toHaveLength(1);
    expect(events.findLast((event) => event.type === 'turn.updated')).toMatchObject({
      turn: { id: reserved.turnId, status: 'running' },
    });
  });

  test('reserves the full input and assistant identity before native execution starts', async () => {
    const state = fixture();
    await state.host.initialize();
    try {
      await state.host.startSession({
        sessionId: state.sessionId,
        agentId: state.agentId,

        userMessageId: uuid(),
        assistantMessageId: uuid(),
        parts: [{ type: 'text', text: 'Hello' }],
      });
      expect(state.conversations.submit).toHaveBeenCalledTimes(1);
      expect(await state.store.listUnsettledAssistantMessages()).toHaveLength(1);
    } finally {
      await state.host.close();
    }
  });

  test('retries a failed answer from stored parts using the aligned input contract', async () => {
    const state = fixture();
    const failed = await state.reserve('failed');
    await state.host.initialize();
    try {
      await state.host.retryMessage({
        sessionId: state.sessionId,
        messageId: failed.assistantMessageId,
      });
      const messages = await state.store.listMessages(state.sessionId);
      expect(messages.map(({ id }) => id)).toEqual([
        failed.userMessageId,
        failed.assistantMessageId,
      ]);
      expect(messages[0].parts).toEqual([
        { id: 'input-0', type: 'text', text: 'Question', state: 'done' },
      ]);
      expect(messages[1]).toMatchObject({ status: 'pending' });
      expect(messages[1].turnId).not.toBe(failed.identity.turnId);
    } finally {
      await state.host.close();
    }
  });

  test('settles completed native results at startup and keeps the idle working copy', async () => {
    const state = fixture();
    const turn = await state.reserve();
    await state.store.renameSession(state.sessionId, 'My title');
    await state.host.initialize();
    try {
      expect((await state.store.listMessages(state.sessionId)).at(-1)).toMatchObject({
        status: 'success',
        parts: turn.parts,
      });
      expect(state.steps).toContain('persisted');
      expect(state.conversations.discardConversation).not.toHaveBeenCalled();
      expect(state.copies.has(state.sessionId)).toBe(true);
      expect(await state.store.getSession(state.sessionId)).toMatchObject({ name: 'My title' });
    } finally {
      await state.host.close();
    }
  });

  test('settles results emitted during stale-copy retirement before accepting new input', async () => {
    const state = fixture();
    const running = await state.reserve('running');
    state.copies.set('deleted-owner', { revision: 0, turns: [] });
    jest.spyOn(state.conversations, 'discardConversation').mockImplementation(async (id) => {
      state.copies.delete(id);
      state.emit({ ...running, status: 'completed' });
    });
    await state.host.initialize();
    try {
      expect(state.conversations.discardConversation).toHaveBeenCalledWith('deleted-owner');
      expect((await state.store.listMessages(state.sessionId)).at(-1)?.status).toBe('success');
      const submitted = await state.host.submitMessage({
        sessionId: state.sessionId,
        userMessageId: uuid(),
        assistantMessageId: uuid(),
        parts: [{ type: 'text', text: 'Continue after rebuilding' }],
      });
      expect(state.host.getSessionStatus(state.sessionId)).toEqual({
        turnId: submitted.turnId,
        status: 'running',
      });
    } finally {
      await state.host.close();
    }
  });

  test('retains unfinished work across ordinary close without marking it interrupted or aborting', async () => {
    const state = fixture();
    await state.reserve('running');
    await state.host.initialize();
    expect(await state.store.listUnsettledAssistantMessages()).toHaveLength(1);
    await Promise.all([state.host.close(), state.host.close()]);
    expect(state.conversations.close).toHaveBeenCalledTimes(1);
    expect(state.conversations.abort).not.toHaveBeenCalled();
  });

  test('an unadmitted reservation becomes interrupted and a missing Cherry owner never reappears', async () => {
    const state = fixture();
    await state.reserve();
    state.copies.clear();
    state.copies.set('deleted-owner', { revision: 0, turns: [] });
    await state.host.initialize();
    try {
      expect((await state.store.listMessages(state.sessionId)).at(-1)?.status).toBe('interrupted');
      expect(await state.store.getSession('deleted-owner')).toBeNull();
      expect(state.conversations.discardConversation).toHaveBeenCalledWith('deleted-owner');
    } finally {
      await state.host.close();
    }
  });

  test('publishes a terminal event only after the complete assistant row commits', async () => {
    const state = fixture();
    const running = await state.reserve('running');
    await state.host.initialize();
    const statuses: Promise<string | undefined>[] = [];
    const events: AgentEvent[] = [];
    await state.host.observeSession(state.sessionId, (event) => {
      events.push(event);
      if (event.type === 'message.finalized')
        statuses.push(
          state.store.listMessages(state.sessionId).then((messages) => messages.at(-1)?.status),
        );
    });
    state.emit({ ...running, status: 'completed' });
    await state.host.quiesce();
    expect(await Promise.all(statuses)).toEqual(['success']);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'message.finalized',
        message: expect.objectContaining({ parts: running.parts }),
      }),
    );
    await state.host.close();
  });

  test('a failed terminal write leaves a recoverable pending row and blocks premature completion', async () => {
    const state = fixture();
    const running = await state.reserve('running');
    await state.host.initialize();
    const events: AgentEvent[] = [];
    await state.host.observeSession(state.sessionId, (event) => events.push(event));
    jest
      .spyOn(state.store, 'finalizeAssistantMessage')
      .mockRejectedValueOnce(new Error('disk full'));
    state.emit({ ...running, status: 'completed' });
    await state.host.quiesce();
    expect(events.filter((event) => event.type === 'message.finalized')).toHaveLength(1);
    expect((await state.store.listMessages(state.sessionId)).at(-1)?.status).toBe('success');
    expect(state.copies.has(state.sessionId)).toBe(true);
    await state.host.close();
  });

  test('deleting a source physically removes its rows while an independent fork remains readable', async () => {
    const state = fixture();
    const turn = await state.reserve();
    await state.host.initialize();
    try {
      const fork = await state.host.forkSession({
        sessionId: state.sessionId,
        fromMessageId: turn.assistantMessageId,
      });
      await state.host.deleteSession({ sessionId: state.sessionId });
      expect(await state.store.getSession(state.sessionId)).toBeNull();
      expect(await state.store.listMessages(state.sessionId)).toEqual([]);
      expect((await state.store.listMessages(fork.id)).at(-1)?.parts).toEqual(turn.parts);
    } finally {
      await state.host.close();
    }
  });

  test('a transcript deletion invalidates a leftover working copy even if cleanup never ran', async () => {
    const state = fixture();
    const turn = await state.reserve();
    await state.store.finalizeAssistantMessage({
      assistantMessageId: turn.assistantMessageId,
      status: 'success',
      parts: [],
      usage: null,
      error: null,
      contextCheckpoint: null,
      runtimeStats: { runtimeTiming: { startedAt: 20, completedAt: 30, spans: [] } },
    });
    await state.store.deleteTurn({ sessionId: state.sessionId, turnId: turn.identity.turnId });
    await state.host.initialize();
    try {
      expect(state.conversations.discardConversation).toHaveBeenCalledWith(state.sessionId);
      expect(await state.store.listMessages(state.sessionId)).toEqual([]);
    } finally {
      await state.host.close();
    }
  });
});
