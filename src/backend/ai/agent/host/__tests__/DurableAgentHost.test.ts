import { v7 as uuid } from 'uuid';

import type {
  AgentEvent,
  AgentInferenceSnapshotV1,
  AgentMessagePart,
} from '@/shared/contracts/agent';
import { createUniqueModelId } from '@/shared/data/types/model';

import { createTraceRecorder } from '../../../observability/__tests__/_traceRecorder';
import {
  FakeRuntime,
  LANES_PER_SESSION,
  laneKey,
  parseLaneKey,
  runtimeLane,
  type DurableAgentRuntime,
  type RuntimeArtifact,
  type RuntimeConversationEvent,
  type RuntimeDurableTurn,
  type RuntimeExecutionPorts,
  type RuntimeTool,
  type RuntimeToolResult,
} from '../../runtime';
import { InMemoryAgentSessionStore } from '../../sessionStore/InMemoryAgentSessionStore';
import { buildAgentSystemPrompt } from '../agentSystemPrompt';
import { DurableAgentHost } from '../DurableAgentHost';
import type { MobileAgentHostPorts } from '../MobileAgentHost';
import type { SkillTurnScope } from '../skillScope';

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
    const copy = copies.get(laneKey(turn.identity))!;
    copy.turns = [
      ...copy.turns.filter((item) => item.identity.requestId !== turn.identity.requestId),
      turn,
    ];
    listeners.get(laneKey(turn.identity))?.({ type: 'turn.updated', turn });
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
      [...copies].map(([key, copy]) => ({ lane: parseLaneKey(key), revision: copy.revision })),
    lanes: async (id) =>
      Array.from({ length: LANES_PER_SESSION }, (_, slot) => runtimeLane(id, slot)).flatMap(
        (lane) => {
          const copy = copies.get(laneKey(lane));
          return copy ? [{ lane, revision: copy.revision }] : [];
        },
      ),
    revision: async (lane) => copies.get(laneKey(lane))?.revision,
    hasConversation: async (lane) => copies.has(laneKey(lane)),
    unfinishedLanes: async () =>
      [...copies]
        .filter(([, copy]) =>
          copy.turns.some((turn) => ['running', 'queued'].includes(turn.status)),
        )
        .map(([key]) => parseLaneKey(key)),
    hasUnfinishedWork: async () => (await conversations.unfinishedLanes()).length > 0,
    watchWork: async () => ({ active: false, unsubscribe: async () => {} }),
    configuration: async () => configuration,
    configure: async () => {},
    resourceFileEntryIds: async () => [],
    ensureConversation: async (seed) => {
      copies.set(laneKey(seed.lane), { revision: seed.revision, turns: [] });
      return seed.history ? 'pi:imported' : undefined;
    },
    forkConversation: async (seed) => {
      copies.set(laneKey(seed.lane), { revision: seed.revision, turns: [] });
    },
    submit: jest.fn(async (lane, input) => {
      expect((await store.getMessage(lane.sessionId, input.assistantMessageId))?.status).toBe(
        'pending',
      );
      const turn: RuntimeDurableTurn = {
        identity: { ...lane, turnId: input.turnId, requestId: input.requestId },
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
    observe: async (lane, listener) => {
      listeners.set(laneKey(lane), listener);
      const turns = copies.get(laneKey(lane))?.turns ?? [];
      return {
        snapshot: {
          activeTurn: turns.find((turn) => turn.status === 'running') ?? null,
          queue: turns.filter((turn) => turn.status === 'queued'),
        },
        unsubscribe: async () => {
          listeners.delete(laneKey(lane));
        },
      };
    },
    history: async (lane, query) => ({
      turns: (copies.get(laneKey(lane))?.turns ?? [])
        .toReversed()
        .filter((turn) => !query.requestIds || query.requestIds.includes(turn.identity.requestId))
        .slice(0, query.limit),
    }),
    message: async (lane, messageId) => {
      const turn = copies
        .get(laneKey(lane))
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
    abort: jest.fn(async (lane) => {
      for (const turn of copies.get(laneKey(lane))?.turns ?? [])
        if (['queued', 'running'].includes(turn.status)) emit({ ...turn, status: 'cancelled' });
    }),
    discardConversation: jest.fn(async (lane) => {
      copies.delete(laneKey(lane));
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
              mode: 'standard',
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
      size: () => 0,
      discard: () => {},
      notifyTranscript: () => {
        steps.push('persisted');
      },
    },
    recordDurableUsage: async () => {},
    ...overrides,
  };
  const reply = {
    updateContent: jest.fn(),
    awaitApproval: jest.fn(),
    finish: jest.fn(),
    retire: jest.fn(),
    update: jest.fn(),
  };
  const background = {
    acquirePreparation: () => ({ release() {} }),
    clearSession() {},
    updateSessionTitle() {},
    startTurn: jest.fn(() => reply),
  };
  const host = new DurableAgentHost(store, ports, background, new FakeRuntime(), conversations);
  const reserve = async (
    status: RuntimeDurableTurn['status'] = 'completed',
    userParts: AgentMessagePart[] = [
      { id: 'question', type: 'text', text: 'Question', state: 'done' },
    ],
    workspaceFolderId?: string,
  ) => {
    const reserved = await store.reserveInitialSubmission({
      sessionId,
      agentId,
      ...(workspaceFolderId ? { workspaceFolderId } : {}),

      userMessageId: uuid(),
      assistantMessageId: uuid(),
      userParts,
      modelId: inferenceSnapshot.model.uniqueModelId,
      inferenceSnapshot,
    });
    const turn: RuntimeDurableTurn = {
      identity: { sessionId, slot: 0, turnId: reserved.turnId, requestId: reserved.turnId },
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
        workspaceFolderId: workspaceFolderId ?? null,
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
    background,
    reply,
    execution: () => execution,
  };
}

/** Lets settlement and background presentation finish their store round trips. */
async function settle() {
  for (let round = 0; round < 20; round++) await new Promise((resolve) => setImmediate(resolve));
}

describe('durable tool diagnostics', () => {
  test('publishes the recovered queue to observations installed before initialization', async () => {
    const f = fixture();
    const queued = { ...(await f.reserve('queued')), inputBoundary: null, answerBoundary: null };
    f.copies.get(f.sessionId)!.turns = [queued];
    const events: AgentEvent[] = [];
    const observation = await f.host.observeSession(f.sessionId, (event) => events.push(event));
    try {
      expect(observation.snapshot.queuedInputs).toEqual([]);
      await f.host.initialize();
      expect(events).toContainEqual({
        type: 'queue.updated',
        inputs: [
          expect.objectContaining({
            turnId: queued.identity.turnId,
            assistantMessageId: queued.assistantMessageId,
          }),
        ],
      });
    } finally {
      observation.unsubscribe();
      await f.host.close();
    }
  });

  test('recovery finishes withdrawal when the process stopped before the reservation was removed', async () => {
    const f = fixture();
    const turn = {
      ...(await f.reserve('cancelled')),
      inputBoundary: null,
      answerBoundary: null,
      parts: [],
    };
    f.copies.get(f.sessionId)!.turns = [turn];
    try {
      await f.host.initialize();
      expect(await f.store.listMessages(f.sessionId)).toEqual([]);
      expect(await f.store.getRuntimeRevision(f.sessionId)).toBe(0);
      expect(f.conversations.abort).not.toHaveBeenCalled();
    } finally {
      await f.host.close();
    }
  });

  test('restores a queued-only input with a withdrawal control and removes only its reservation', async () => {
    const f = fixture();
    const turn = {
      ...(await f.reserve('queued')),
      inputBoundary: null,
      answerBoundary: null,
      parts: [],
    };
    f.copies.get(f.sessionId)!.turns = [turn];
    await f.host.initialize();
    const events: AgentEvent[] = [];
    const observation = await f.host.observeSession(f.sessionId, (event) => events.push(event));
    try {
      expect(observation.snapshot.activeTurn).toBeNull();
      expect(observation.snapshot.queuedInputs).toMatchObject([
        {
          turnId: turn.identity.turnId,
          userMessage: { id: turn.userMessageId },
          assistantMessageId: turn.assistantMessageId,
        },
      ]);
      const revision = await f.store.getRuntimeRevision(f.sessionId);
      jest.spyOn(f.conversations, 'withdraw').mockImplementation(async () => {
        f.emit({ ...turn, status: 'cancelled' });
        return 'aborted';
      });
      await expect(
        f.host.cancelQueuedInput({ sessionId: f.sessionId, turnId: turn.identity.turnId }),
      ).resolves.toBe('withdrawn');
      expect(await f.store.listMessages(f.sessionId)).toEqual([]);
      expect(await f.store.getRuntimeRevision(f.sessionId)).toBe(revision);
      expect(f.conversations.abort).not.toHaveBeenCalled();
      expect(events).toContainEqual({ type: 'queue.updated', inputs: [] });
      expect(
        events.some(
          (event) => event.type === 'message.created' || event.type === 'message.finalized',
        ),
      ).toBe(false);
    } finally {
      observation.unsubscribe();
      await f.host.close();
    }
  });

  test('a queued removal that loses the placement race never aborts the active run', async () => {
    const f = fixture();
    const turn = {
      ...(await f.reserve('queued')),
      inputBoundary: null,
      answerBoundary: null,
      parts: [],
    };
    f.copies.get(f.sessionId)!.turns = [turn];
    await f.host.initialize();
    jest.spyOn(f.conversations, 'withdraw').mockImplementation(async () => {
      f.emit({ ...turn, status: 'running', inputBoundary: 'pi:1' });
      return 'already-placed';
    });
    try {
      await expect(
        f.host.cancelQueuedInput({ sessionId: f.sessionId, turnId: turn.identity.turnId }),
      ).resolves.toBe('already-started');
      expect(f.conversations.abort).not.toHaveBeenCalled();
      expect(await f.store.listMessages(f.sessionId)).toHaveLength(2);
      const observation = await f.host.observeSession(f.sessionId, () => {});
      expect(observation.snapshot.queuedInputs).toEqual([]);
      expect(observation.snapshot.activeTurn?.id).toBe(turn.identity.turnId);
      observation.unsubscribe();
    } finally {
      await f.host.close();
    }
  });

  test('withdrawing an input leaves a concurrent reservation pending until native admission', async () => {
    const f = fixture();
    const queued = { ...(await f.reserve('queued')), inputBoundary: null, answerBoundary: null };
    f.copies.get(f.sessionId)!.turns = [queued];
    jest.spyOn(f.conversations, 'configuration').mockResolvedValue({
      ...configuration,
      instructions: buildAgentSystemPrompt({
        agentInstructions: '',
        appLanguage: 'zh-CN',
        tools: [],
      }),
    });
    await f.host.initialize();
    let reachedAdmission!: () => void;
    const admissionStarted = new Promise<void>((resolve) => {
      reachedAdmission = resolve;
    });
    let resumeAdmission!: () => void;
    const admissionReleased = new Promise<void>((resolve) => {
      resumeAdmission = resolve;
    });
    const submit = jest.mocked(f.conversations.submit).getMockImplementation()!;
    jest.spyOn(f.conversations, 'submit').mockImplementation(async (sessionId, input) => {
      reachedAdmission();
      await admissionReleased;
      return submit(sessionId, input);
    });
    jest.spyOn(f.conversations, 'withdraw').mockImplementation(async () => {
      f.emit({ ...queued, status: 'cancelled' });
      return 'aborted';
    });
    const assistantMessageId = uuid();
    const submitting = f.host.submitMessage({
      sessionId: f.sessionId,
      userMessageId: uuid(),
      assistantMessageId,
      parts: [{ type: 'text', text: 'A concurrent follow-up' }],
    });
    try {
      await admissionStarted;
      await expect(
        f.host.cancelQueuedInput({
          sessionId: f.sessionId,
          turnId: queued.identity.turnId,
        }),
      ).resolves.toBe('withdrawn');
      const rows = await f.store.listMessages(f.sessionId);
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.id === assistantMessageId)).toMatchObject({
        status: 'pending',
        parts: [],
      });
      expect(f.conversations.abort).not.toHaveBeenCalled();
    } finally {
      resumeAdmission();
      try {
        await submitting;
      } finally {
        await f.host.close();
      }
    }
  });

  test('stores Code Mode outputs in the workspace the turn captured', async () => {
    const workspaceFolderId = uuid();
    const writeToolOutput = jest.fn(
      async (): Promise<RuntimeArtifact> => ({
        ref: { kind: 'managed-file', fileEntryId: uuid() },
        name: 'result.csv',
        mediaType: 'text/plain',
        kind: 'created',
      }),
    );
    const state = fixture({ writeToolOutput });
    const turn = await state.reserve('running', undefined, workspaceFolderId);
    await state.host.initialize();
    try {
      const signal = new AbortController().signal;
      await state.execution()!.writeToolOutput!(
        turn.identity,
        { name: 'result.csv', data: 'a,b' },
        signal,
      );
      expect(writeToolOutput).toHaveBeenCalledWith(
        { name: 'result.csv', data: 'a,b', folderId: workspaceFolderId },
        signal,
      );
    } finally {
      await state.host.close();
    }
  });

  test.each(['bound', 'unbound'] as const)(
    'preserves an admitted %s workspace through rebinding and host suspension',
    async (binding) => {
      const originalFolderId = binding === 'bound' ? uuid() : null;
      const nextFolderId = uuid();
      let interrupt!: (reason: Error) => void | Promise<void>;
      const getTools = jest.fn(async () => []);
      const resolveTools = jest.fn(async () => ({ tools: [], pluginGuides: [] }));
      const writeToolOutput = jest.fn(
        async (): Promise<RuntimeArtifact> => ({
          ref: { kind: 'managed-file', fileEntryId: uuid() },
          name: 'result.csv',
          mediaType: 'text/plain',
          kind: 'created',
        }),
      );
      const state = fixture({
        executionLease: (onInterrupt) => {
          interrupt = onInterrupt;
          return { release() {} };
        },
        tools: { getTools },
        runtimeTools: { resolve: resolveTools },
        writeToolOutput,
      });
      state.conversations.watchWork = async () => ({ active: true, unsubscribe: async () => {} });
      await state.host.initialize();
      try {
        await state.host.startSession({
          sessionId: state.sessionId,
          agentId: state.agentId,
          userMessageId: uuid(),
          assistantMessageId: uuid(),
          parts: [{ type: 'text', text: 'Write a CSV' }],
          ...(originalFolderId ? { workspaceFolderId: originalFolderId } : {}),
        });
        const turn = state.copies.get(state.sessionId)!.turns[0]!;
        expect(turn.metadata.workspaceFolderId).toBe(originalFolderId);
        const getSession = state.store.getSession.bind(state.store);
        jest.spyOn(state.store, 'getSession').mockImplementation(async (id) => {
          const session = await getSession(id);
          return session ? { ...session, workspaceFolderId: nextFolderId } : null;
        });
        await interrupt(new Error('Background window expired'));
        await state.host.resumeSuspended();
        const signal = new AbortController().signal;
        await state.execution()!.writeToolOutput!(
          turn.identity,
          { name: 'result.csv', data: 'a,b' },
          signal,
        );
        expect(writeToolOutput).toHaveBeenLastCalledWith(
          { name: 'result.csv', data: 'a,b', folderId: originalFolderId },
          signal,
        );
        expect(getTools).toHaveBeenLastCalledWith(
          expect.objectContaining({ workspaceFolderId: originalFolderId }),
        );
        expect(resolveTools).toHaveBeenLastCalledWith(
          state.agentId,
          expect.any(Function),
          signal,
          originalFolderId,
        );
        state.emit({ ...turn, status: 'completed' });
        await state.host.submitMessage({
          sessionId: state.sessionId,
          userMessageId: uuid(),
          assistantMessageId: uuid(),
          parts: [{ type: 'text', text: 'Write in the new workspace' }],
        });
        expect(state.copies.get(state.sessionId)!.turns.at(-1)!.metadata.workspaceFolderId).toBe(
          nextFolderId,
        );
      } finally {
        await state.host.close();
      }
    },
  );

  test('records returned installation errors without changing execution failure policy', async () => {
    const { traces, records } = createTraceRecorder();
    const output: RuntimeToolResult = {
      value: { status: 'error', code: 'package-invalid', message: 'private package details' },
      artifacts: [],
    };
    const tool: RuntimeTool = {
      ref: { source: 'builtin', capabilityId: 'install_skill' },
      providerName: 'install_skill',
      displayName: 'Install Skill',
      description: '',
      inputSchema: { type: 'object' },
      approval: 'auto',
      execute: async () => output,
    };
    const state = fixture({ traces, tools: { getTools: async () => [tool] } });
    const turn = await state.reserve('running');
    await state.host.initialize();
    try {
      const signal = new AbortController().signal;
      const resolved = await state.execution()!.resolveTool(turn.identity, tool.ref, signal);
      const result = await resolved.execute({
        input: { url: 'https://private.example' },
        signal,
        toolCallId: 'call-1',
        turnId: turn.identity.turnId,
      });
      expect(result).toBe(output);
      expect(result.failure).toBeUndefined();
      expect(records.at(-1)).toMatchObject({
        name: 'pi.execute_tool',
        status: 'error',
        attributes: {
          'tool.result.status': 'error',
          'error.code': 'package-invalid',
          'error.origin': 'tool',
        },
      });
      expect(JSON.stringify(records)).not.toContain('private');
    } finally {
      await state.host.close();
    }
  });

  test.each(['returned', 'thrown', 'cancelled'] as const)(
    'retains safe facts for a %s tool failure without changing the result',
    async (outcome) => {
      const { traces, records } = createTraceRecorder();
      const controller = new AbortController();
      const failure: NonNullable<RuntimeToolResult['failure']> = {
        scope: 'tool',
        error: {
          name: 'HttpError',
          code: 'page_http_error',
          message: 'private failure message',
          retryable: false,
          origin: 'tool',
          context: { statusCode: 403, responseBody: 'private response body' },
        },
      };
      const output: RuntimeToolResult = { value: 'private tool result', artifacts: [], failure };
      const error = Object.assign(new Error(failure.error.message), failure.error);
      const tool: RuntimeTool = {
        ref: { source: 'builtin', capabilityId: 'fetch_url' },
        providerName: 'fetch_url',
        displayName: 'Fetch URL',
        description: '',
        inputSchema: { type: 'object' },
        approval: 'auto',
        execute: async () => {
          if (outcome === 'cancelled') controller.abort();
          if (outcome !== 'returned') throw error;
          return output;
        },
      };
      const state = fixture({
        traces,
        tools: { getTools: async () => [tool] },
      });
      const turn = await state.reserve('running');
      await state.host.initialize();
      try {
        const resolved = await state
          .execution()!
          .resolveTool(turn.identity, tool.ref, controller.signal);
        const result = resolved.execute({
          input: { url: 'https://private.example' },
          signal: controller.signal,
          toolCallId: 'call-1',
          turnId: turn.identity.turnId,
        });
        if (outcome === 'returned') await expect(result).resolves.toBe(output);
        else await expect(result).rejects.toBe(error);
        expect(records.at(-1)).toMatchObject({
          name: 'pi.execute_tool',
          status: outcome === 'cancelled' ? 'cancelled' : 'error',
          context: {
            agentId: state.agentId,
            sessionId: state.sessionId,
            turnId: turn.identity.turnId,
            requestId: turn.identity.requestId,
          },
          attributes: {
            'tool.name': 'fetch_url',
            'tool.call.id': 'call-1',
            'error.type': 'HttpError',
            'error.code': 'page_http_error',
            'error.origin': 'tool',
            'error.retryable': false,
            'http.status_code': 403,
          },
        });
        expect(JSON.stringify(records)).not.toMatch(/private|responseBody/);
      } finally {
        await state.host.close();
      }
    },
  );
});

describe('Cherry-owned transcript and disposable execution recovery', () => {
  test('storage failure preserves pending turns and concurrent retries share one reopen', async () => {
    const release = jest.fn();
    const state = fixture({ executionLease: () => ({ release }) });
    jest
      .spyOn(state.conversations, 'watchWork')
      .mockResolvedValue({ active: true, unsubscribe: async () => {} });
    const turn = await state.reserve('running');
    await state.host.initialize();
    const events: AgentEvent[] = [];
    await state.host.observeSession(state.sessionId, (event) => events.push(event));
    state.execution()!.onFailure!({
      code: 'unknown',
      message: 'Storage unavailable',
      retryable: false,
    });
    expect(events).toContainEqual({ type: 'runtime.failed' });
    const observations = await Promise.all([
      state.host.observeSession(state.sessionId, () => {}),
      state.host.observeSession(state.sessionId, () => {}),
    ]);
    expect(state.conversations.initialize).toHaveBeenCalledTimes(2);
    expect(state.conversations.abort).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    expect(
      (await state.store.listMessages(state.sessionId)).find(
        (message) => message.id === turn.assistantMessageId,
      )?.status,
    ).toBe('pending');
    for (const observation of observations) {
      expect(observation.snapshot.activeTurn?.id).toBe(turn.identity.turnId);
      observation.unsubscribe();
    }
    await state.host.close();
  });

  test('a submission from a new chat reopens the engine after a storage failure', async () => {
    const state = fixture();
    await state.host.initialize();
    state.execution()!.onFailure!({
      code: 'unknown',
      message: 'Storage unavailable',
      retryable: false,
    });
    try {
      // No session is observed, so nothing on screen carries a retry action.
      await state.host.startSession({
        sessionId: state.sessionId,
        agentId: state.agentId,
        userMessageId: uuid(),
        assistantMessageId: uuid(),
        parts: [{ type: 'text', text: 'Hello' }],
      });
      expect(state.conversations.initialize).toHaveBeenCalledTimes(2);
      expect(state.conversations.submit).toHaveBeenCalledTimes(1);
    } finally {
      await state.host.close();
    }
  });

  test('records a failed recovery even when the durable database cannot open', async () => {
    const { traces, records } = createTraceRecorder();
    const state = fixture({
      traces,
      durableStorage: {
        open: async () => {
          throw Object.assign(new Error('private database path'), { code: 'SQLITE_CANTOPEN' });
        },
        size: () => 0,
        discard: () => {},
        notifyTranscript: () => {},
      },
    });
    await expect(state.host.initialize()).rejects.toThrow('private database path');
    expect(records.findLast((record) => record.name === 'ai.recovery')).toMatchObject({
      name: 'ai.recovery',
      status: 'error',
      attributes: { 'error.code': 'SQLITE_CANTOPEN' },
    });
    expect(JSON.stringify(records)).not.toContain('private');
  });

  test('retains preparation failures before any model request or durable admission', async () => {
    const { traces, records } = createTraceRecorder();
    const state = fixture({ traces });
    await state.host.initialize();
    jest
      .spyOn(state.conversations, 'ensureConversation')
      .mockRejectedValueOnce(
        Object.assign(new Error('private configuration'), { code: 'SQLITE_FULL' }),
      );
    try {
      await expect(
        state.host.startSession({
          sessionId: state.sessionId,
          agentId: state.agentId,
          userMessageId: uuid(),
          assistantMessageId: uuid(),
          parts: [{ type: 'text', text: 'private question' }],
        }),
      ).rejects.toThrow('private configuration');
      expect(records.findLast((record) => record.name === 'ai.admission')).toMatchObject({
        status: 'error',
        context: { sessionId: state.sessionId },
        attributes: { 'error.code': 'SQLITE_FULL' },
      });
      expect(await state.store.listUnsettledAssistantMessages()).toHaveLength(0);
      expect(JSON.stringify(records)).not.toContain('private');
    } finally {
      await state.host.close();
    }
  });
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

  test('clearing working storage deletes the closed file before reopening it', async () => {
    const discard = jest.fn(() => {
      state.steps.push('discard');
    });
    const state = fixture({
      durableStorage: {
        open: async () => ({}) as never,
        size: () => 0,
        discard,
        notifyTranscript: () => {},
      },
    });
    await state.host.initialize();
    try {
      state.steps.length = 0;
      await state.host.clearWorkingStorage();
      const fileSteps = () => state.steps.filter((step) => step !== 'usage');
      expect(fileSteps()).toEqual(['close', 'discard', 'open', 'resume']);
      expect(state.host.isReady).toBe(true);

      state.steps.length = 0;
      discard.mockImplementationOnce(() => {
        throw new Error('locked');
      });
      await expect(state.host.clearWorkingStorage()).rejects.toThrow('locked');
      expect(fileSteps()).toEqual(['close', 'open', 'resume']);
      expect(state.host.isReady).toBe(true);
    } finally {
      await state.host.close();
    }
  });

  test('clearing working storage leaves the file open while native work runs', async () => {
    const discard = jest.fn();
    const state = fixture({
      durableStorage: {
        open: async () => ({}) as never,
        size: () => 0,
        discard,
        notifyTranscript: () => {},
      },
    });
    jest.spyOn(state.conversations, 'hasUnfinishedWork').mockResolvedValue(true);
    await state.host.initialize();
    try {
      await expect(state.host.clearWorkingStorage()).rejects.toMatchObject({ code: 'busy' });
      expect(discard).not.toHaveBeenCalled();
      expect(state.conversations.close).not.toHaveBeenCalled();
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

  test.each([
    ['completed', 'ok'],
    ['failed', 'error'],
    ['cancelled', 'cancelled'],
    ['interrupted', 'interrupted'],
  ] as const)(
    'records a delayed %s outcome without replacing the next running input',
    async (status, outcome) => {
      const { traces, records } = createTraceRecorder();
      const state = fixture({ traces });
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
      state.emit({
        ...first,
        status,
        error:
          status === 'failed'
            ? { code: 'TIMEOUT', message: 'private provider response', retryable: true }
            : null,
      });
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
        identity: {
          sessionId: state.sessionId,
          slot: 0,
          turnId: reserved.turnId,
          requestId: reserved.turnId,
        },
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
      const terminal = records.filter(
        (record) =>
          record.name === 'ai.turn_state' &&
          record.revision === 2 &&
          record.context.turnId === first.identity.turnId &&
          record.attributes['agent.turn.status'] === status,
      );
      expect(terminal).toEqual([
        expect.objectContaining({
          status: outcome,
          context: {
            sessionId: first.identity.sessionId,
            turnId: first.identity.turnId,
            requestId: first.identity.requestId,
            messageId: first.assistantMessageId,
          },
          attributes: expect.objectContaining({
            'agent.turn.status': status,
            ...(status === 'failed'
              ? { 'error.code': 'EXECUTION_FAILED', 'error.retryable': true }
              : {}),
          }),
        }),
      ]);
      expect(JSON.stringify(terminal)).not.toContain('private');
    },
  );

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

  test('hands the frozen web policy to the Runtime with the conversation configuration', async () => {
    const webTools = {
      modelToolsPreferred: true,
      clientSearchAvailable: true,
      clientFetchAvailable: true,
    };
    const state = fixture({ webTools: async () => webTools });
    const ensureConversation = jest.spyOn(state.conversations, 'ensureConversation');
    await state.host.initialize();
    try {
      await state.host.startSession({
        sessionId: state.sessionId,
        agentId: state.agentId,

        userMessageId: uuid(),
        assistantMessageId: uuid(),
        parts: [{ type: 'text', text: 'Hello' }],
      });
      expect(ensureConversation.mock.calls[0]![0].configuration.webTools).toEqual(webTools);
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

  test('regenerating a completed answer adds a selected sibling in the same Session', async () => {
    const state = fixture();
    const original = await state.reserve('completed');
    await state.host.initialize();
    try {
      await state.store.finalizeAssistantMessage({
        assistantMessageId: original.assistantMessageId,
        status: 'success',
        parts: [],
        usage: null,
        error: null,
        contextCheckpoint: null,
        runtimeStats: { runtimeTiming: { startedAt: 1, completedAt: 2, spans: [] } },
      });
      expect(
        await state.host.retryMessage({
          sessionId: state.sessionId,
          messageId: original.assistantMessageId,
        }),
      ).toBeUndefined();
      const [question, answer] = await state.store.listMessages(state.sessionId);
      expect(question?.id).toBe(original.userMessageId);
      expect(answer).toMatchObject({ parentId: original.userMessageId, status: 'pending' });
      expect(answer?.id).not.toBe(original.assistantMessageId);
      expect(
        await state.store.getMessage(state.sessionId, original.assistantMessageId),
      ).toMatchObject({ status: 'success' });
      // The sibling runs on its own working copy; the original copy keeps its history.
      const [lane] = (state.conversations.submit as jest.Mock).mock.calls.at(-1)!;
      expect(lane).toEqual(runtimeLane(state.sessionId, 1));
      expect(state.copies.get(state.sessionId)?.turns).toHaveLength(1);
    } finally {
      await state.host.close();
    }
  });

  test('answering with another model adds a sibling even below a failed answer', async () => {
    const state = fixture();
    const original = await state.reserve('failed');
    await state.host.initialize();
    try {
      await state.store.finalizeAssistantMessage({
        assistantMessageId: original.assistantMessageId,
        status: 'error',
        parts: [],
        usage: null,
        error: { code: 'INTERRUPTED', message: 'The app stopped.', retryable: true },
        contextCheckpoint: null,
        runtimeStats: { runtimeTiming: { startedAt: 1, completedAt: 2, spans: [] } },
      });
      const second = createUniqueModelId('provider', 'second-model');
      await state.host.retryMessage({
        sessionId: state.sessionId,
        messageId: original.assistantMessageId,
        modelId: second,
      });

      // The failed answer is kept rather than repaired in place.
      expect(
        await state.store.getMessage(state.sessionId, original.assistantMessageId),
      ).toMatchObject({ status: 'error' });
      const [answer] = await state.store.listUnsettledAssistantMessages();
      expect(
        await state.store.getMessage(state.sessionId, answer!.assistantMessageId),
      ).toMatchObject({ modelId: second, parentId: original.userMessageId, siblingsGroupId: 0 });
      expect((await state.store.getSession(state.sessionId))?.activeNodeId).toBe(
        answer!.assistantMessageId,
      );
    } finally {
      await state.host.close();
    }
  });

  test('parallel answers share one question and each run on its own lane', async () => {
    const state = fixture();
    await state.host.initialize();
    try {
      const second = createUniqueModelId('provider', 'second-model');
      const result = await state.host.startSession({
        sessionId: state.sessionId,
        agentId: state.agentId,
        userMessageId: uuid(),
        assistantMessageId: uuid(),
        modelId: inferenceSnapshot.model.uniqueModelId,
        additionalReplies: [{ modelId: second, assistantMessageId: uuid() }],
        parts: [{ type: 'text', text: 'Compare' }],
      });
      expect(result.activeNodeId).toBeTruthy();
      const calls = (state.conversations.submit as jest.Mock).mock.calls;
      expect(calls).toHaveLength(2);
      expect(new Set(calls.map(([lane]) => lane)).size).toBe(2);
      expect(calls.map(([, input]) => input.metadata.readOnlyTools)).toEqual([true, true]);
      expect(new Set(calls.map(([, input]) => input.turnId)).size).toBe(1);
      const unsettled = await state.store.listUnsettledAssistantMessages();
      expect(unsettled).toHaveLength(2);
      const answers = await Promise.all(
        unsettled.map((row) => state.store.getMessage(state.sessionId, row.assistantMessageId)),
      );
      expect(answers.map((answer) => answer?.siblingsGroupId)).toEqual([1, 1]);
      expect(answers.map((answer) => answer?.modelId)).toEqual([
        inferenceSnapshot.model.uniqueModelId,
        second,
      ]);
    } finally {
      await state.host.close();
    }
  });

  test('branches reuse a bounded set of working copies, replacing the least recently used', async () => {
    const state = fixture();
    const original = await state.reserve('completed');
    await state.host.initialize();
    try {
      for (let index = 0; index < LANES_PER_SESSION + 1; index++) {
        await state.host.retryMessage({
          sessionId: state.sessionId,
          messageId: original.assistantMessageId,
        });
        const [lane] = (state.conversations.submit as jest.Mock).mock.calls.at(-1)!;
        const turn = state.copies.get(laneKey(lane))!.turns.at(-1)!;
        state.emit({
          ...turn,
          status: 'completed',
          answerBoundary: 'pi:2',
          updatedAt: 100 + index,
        });
        await state.host.quiesce();
      }
      expect(state.copies.size).toBe(LANES_PER_SESSION);
      // Every slot was taken, so the next copies replaced the oldest idle ones in order.
      expect(
        (state.conversations.discardConversation as jest.Mock).mock.calls.map(([lane]) => lane),
      ).toEqual([runtimeLane(state.sessionId, 0), runtimeLane(state.sessionId, 1)]);
    } finally {
      await state.host.close();
    }
  });

  test('sending and stopping read only the Session own working copies', async () => {
    const state = fixture();
    await state.reserve('completed');
    await state.host.initialize();
    try {
      const sessions = jest.spyOn(state.conversations, 'sessions');
      const unfinished = jest.spyOn(state.conversations, 'unfinishedLanes');
      const observation = await state.host.observeSession(state.sessionId, () => {});
      const submitted = await state.host.submitMessage({
        sessionId: state.sessionId,
        userMessageId: uuid(),
        assistantMessageId: uuid(),
        parts: [{ type: 'text', text: 'Follow up' }],
      });
      await state.host.cancelTurn({ sessionId: state.sessionId, turnId: submitted.turnId });
      observation.unsubscribe();
      expect(sessions).not.toHaveBeenCalled();
      expect(unfinished).not.toHaveBeenCalled();
    } finally {
      await state.host.close();
    }
  });

  test('rebuilds the selected branch from Cherry history once the engine copies are gone', async () => {
    const state = fixture();
    const original = await state.reserve('completed');
    await state.host.initialize();
    try {
      await state.host.retryMessage({
        sessionId: state.sessionId,
        messageId: original.assistantMessageId,
      });
      const [lane] = (state.conversations.submit as jest.Mock).mock.calls.at(-1)!;
      const sibling = state.copies.get(laneKey(lane))!.turns.at(-1)!;
      state.emit({
        ...sibling,
        status: 'completed',
        answerBoundary: 'pi:2',
        parts: [{ id: 'sibling', type: 'text', text: 'Sibling', state: 'done' }],
      });
      await state.host.quiesce();
      // The engine database is disposable: Cherry history is the only source left.
      state.copies.clear();
      const ensure = jest.spyOn(state.conversations, 'ensureConversation');
      await state.host.submitMessage({
        sessionId: state.sessionId,
        userMessageId: uuid(),
        assistantMessageId: uuid(),
        parts: [{ type: 'text', text: 'Follow up' }],
      });
      const [seed] = ensure.mock.calls.at(-1)!;
      expect(seed.lane).toEqual(runtimeLane(state.sessionId));
      const history = JSON.stringify(seed.history?.history);
      expect(history).toContain('Sibling');
      expect(history).not.toContain('"Answer"');
    } finally {
      await state.host.close();
    }
  });

  test('rejects parallel answers that repeat a model', async () => {
    const state = fixture();
    await state.host.initialize();
    try {
      await expect(
        state.host.startSession({
          sessionId: state.sessionId,
          agentId: state.agentId,
          userMessageId: uuid(),
          assistantMessageId: uuid(),
          modelId: inferenceSnapshot.model.uniqueModelId,
          additionalReplies: [
            { modelId: inferenceSnapshot.model.uniqueModelId, assistantMessageId: uuid() },
          ],
          parts: [{ type: 'text', text: 'Compare' }],
        }),
      ).rejects.toMatchObject({ view: { code: 'CAPABILITY_UNSUPPORTED' } });
      expect(state.conversations.submit).not.toHaveBeenCalled();
    } finally {
      await state.host.close();
    }
  });

  /** Two answers below the reserved question's answer, one continuing lane 0 and one forked. */
  const askTwoModels = (
    state: ReturnType<typeof fixture>,
    parts = [{ type: 'text' as const, text: 'Compare' }],
  ) =>
    state.host.submitMessage({
      sessionId: state.sessionId,
      userMessageId: uuid(),
      assistantMessageId: uuid(),
      modelId: inferenceSnapshot.model.uniqueModelId,
      additionalReplies: [
        { modelId: createUniqueModelId('provider', 'second-model'), assistantMessageId: uuid() },
      ],
      parts,
    });
  const runningTurns = (state: ReturnType<typeof fixture>) =>
    [...state.copies.values()].flatMap((copy) =>
      copy.turns.filter((turn) => turn.status === 'running'),
    );

  test.each([false, true])(
    'observation restores settled siblings and keeps events during its read (settle during read: %s)',
    async (settleDuringRead) => {
      const state = fixture();
      await state.reserve('completed');
      await state.host.initialize();
      try {
        await askTwoModels(state);
        const [first, second] = runningTurns(state);
        state.emit({
          ...first!,
          status: 'completed',
          parts: [{ id: 'answer', type: 'text', text: 'First answer', state: 'done' }],
        });
        await settle();
        if (settleDuringRead) {
          const read = state.store.listTurnMessages.bind(state.store);
          jest.spyOn(state.store, 'listTurnMessages').mockImplementationOnce(async (...args) => {
            state.emit({ ...second!, status: 'completed' });
            await settle();
            return read(...args);
          });
        }
        const events: AgentEvent[] = [];
        const observation = await state.host.observeSession(state.sessionId, (event) =>
          events.push(event),
        );
        try {
          expect(observation.snapshot.session.activeNodeId).toBe(first!.assistantMessageId);
          expect(observation.snapshot.streamingMessage?.id).toBe(second!.assistantMessageId);
          expect(observation.snapshot.additionalMessages).toEqual([
            expect.objectContaining({
              id: first!.assistantMessageId,
              status: 'success',
              parts: [expect.objectContaining({ text: 'First answer' })],
            }),
          ]);
          if (settleDuringRead)
            expect(events).toContainEqual(
              expect.objectContaining({
                type: 'message.finalized',
                message: expect.objectContaining({
                  id: second!.assistantMessageId,
                  status: 'success',
                }),
              }),
            );
        } finally {
          observation.unsubscribe();
        }
      } finally {
        await state.host.close();
      }
    },
  );

  test('rejects an implicit parallel image model before reserving messages or executing it', async () => {
    const execute = jest.fn(async () => []);
    const state = fixture({
      imageGeneration: {
        prepare: async ({ model }) =>
          model.modelId === 'second-model'
            ? { settings: { mode: 'generate', paramValues: {} }, execute }
            : null,
      },
    });
    await state.reserve('completed');
    await state.host.initialize();
    try {
      const before = await state.store.listMessages(state.sessionId);
      await expect(askTwoModels(state)).rejects.toMatchObject({
        view: { code: 'CAPABILITY_UNSUPPORTED' },
      });
      expect(await state.store.listMessages(state.sessionId)).toEqual(before);
      expect(state.conversations.submit).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    } finally {
      await state.host.close();
    }
  });

  test('regenerating an earlier answer prepares and seeds only the fork prefix file grants', async () => {
    const earlierFile = uuid();
    const laterFile = uuid();
    const scopes: string[][] = [];
    const state = fixture({
      tools: {
        getTools: async ({ resources }) => {
          scopes.push([...resources.fileEntryIds]);
          return [];
        },
      },
    });
    await state.reserve('completed', [
      {
        id: 'file',
        type: 'file',
        fileEntryId: earlierFile,
        mediaType: 'text/plain',
        purpose: 'input-attachment',
      },
    ]);
    await state.host.initialize();
    try {
      const answers: RuntimeDurableTurn[] = [];
      for (const text of ['Q2', 'Q3']) {
        await state.host.submitMessage({
          sessionId: state.sessionId,
          userMessageId: uuid(),
          assistantMessageId: uuid(),
          parts: [{ type: 'text', text }],
        });
        const [turn] = runningTurns(state);
        state.emit({ ...turn!, status: 'completed', answerBoundary: `pi:${answers.length + 3}` });
        answers.push(turn!);
        await state.host.quiesce();
      }
      // The source execution has since gained another file, beyond the requested prefix.
      jest
        .spyOn(state.conversations, 'resourceFileEntryIds')
        .mockResolvedValue([earlierFile, laterFile]);
      const fork = jest.spyOn(state.conversations, 'forkConversation');
      scopes.length = 0;
      await state.host.retryMessage({
        sessionId: state.sessionId,
        messageId: answers[0]!.assistantMessageId,
      });
      expect(scopes).toEqual([[earlierFile]]);
      expect(fork.mock.calls[0]?.[0].referencedFileEntryIds).toEqual([earlierFile]);
      expect(fork.mock.calls[0]?.[0].from.boundary).toBe('pi:2');
    } finally {
      await state.host.close();
    }
  });

  test('parallel answers publish an unchanged running turn and their shared question once', async () => {
    const state = fixture();
    await state.reserve('completed');
    await state.host.initialize();
    try {
      const events: AgentEvent[] = [];
      const observation = await state.host.observeSession(state.sessionId, (event) =>
        events.push(event),
      );
      const submitted = await askTwoModels(state);
      const running = runningTurns(state);
      expect(running).toHaveLength(2);
      // The answers stream in turns; their turn views do not change.
      for (let index = 0; index < 3; index++)
        for (const turn of running)
          state.emit({
            ...turn,
            parts: [{ id: 'text', type: 'text', text: `Part ${index}`, state: 'streaming' }],
          });
      const turns = events.filter((event) => event.type === 'turn.updated');
      expect(turns).toHaveLength(2);
      expect(
        events.filter(
          (event) =>
            event.type === 'message.created' && event.message.id === submitted.userMessageId,
        ),
      ).toHaveLength(1);
      // A changed view is still published.
      state.emit({ ...running[1]!, isRetrying: true });
      expect(events.filter((event) => event.type === 'turn.updated')).toHaveLength(3);
      expect(events.at(-1)).toMatchObject({
        type: 'turn.updated',
        turn: { assistantMessageId: running[1]!.assistantMessageId, isRetrying: true },
      });
      observation.unsubscribe();
    } finally {
      await state.host.close();
    }
  });

  test('the background reply passes to a running answer and ends with the last one', async () => {
    const state = fixture();
    await state.reserve('completed');
    await state.host.initialize();
    try {
      await askTwoModels(state);
      await settle();
      expect(state.background.startTurn).toHaveBeenCalledTimes(1);
      const running = runningTurns(state);
      const holder = running.find(
        (turn) => state.reply.update.mock.calls[0]?.[0]?.id === turn.assistantMessageId,
      )!;
      const other = running.find((turn) => turn !== holder)!;
      state.emit({ ...holder, status: 'completed', answerBoundary: 'pi:3' });
      await settle();
      // Neither restarted nor finished while the other answer runs.
      expect(state.reply.finish).not.toHaveBeenCalled();
      expect(state.reply.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: other.assistantMessageId }),
      );
      state.emit({
        ...other,
        status: 'failed',
        error: { code: 'TIMEOUT', message: 'Timeout', retryable: true },
      });
      await settle();
      expect(state.background.startTurn).toHaveBeenCalledTimes(1);
      expect(state.reply.finish).toHaveBeenCalledTimes(1);
      expect(state.reply.finish).toHaveBeenCalledWith('completed');
    } finally {
      await state.host.close();
    }
  });

  test('prepares parallel answers together and reads a shared image once', async () => {
    const image = { fileEntryId: uuid(), mediaType: 'image/png', name: 'photo.png', size: 3 };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const resolveTools = jest.fn(async () => {
      await gate;
      return { tools: [], pluginGuides: [] };
    });
    const readAsDataUrl = jest.fn(async () => 'data:image/png;base64,AAAA');
    const state = fixture({
      runtimeTools: { resolve: resolveTools },
      files: {
        resolveAvailable: async (ids) =>
          new Map(ids.includes(image.fileEntryId) ? [[image.fileEntryId, image]] : []),
        readAsBytes: async () => undefined,
        readDocumentText: async () => undefined,
        readAsDataUrl,
      },
    });
    await state.reserve('completed');
    await state.host.initialize();
    try {
      const submitted = askTwoModels(state, [
        { type: 'text', text: 'Compare' },
        {
          type: 'file',
          fileEntryId: image.fileEntryId,
          mediaType: 'image/png',
          filename: 'photo.png',
        } as never,
      ]);
      await settle();
      // The second answer did not wait for the first one's tool discovery.
      expect(resolveTools).toHaveBeenCalledTimes(2);
      release();
      await submitted;
      expect(readAsDataUrl).toHaveBeenCalledTimes(1);
      expect(state.conversations.submit).toHaveBeenCalledTimes(2);
    } finally {
      await state.host.close();
    }
  });

  test('answers without a working copy rebuild the history once and fork the rest', async () => {
    const state = fixture();
    await state.reserve('completed');
    await state.host.initialize();
    try {
      // The runtime cache was cleared: Cherry history is the only source left.
      state.copies.clear();
      const ensure = jest.spyOn(state.conversations, 'ensureConversation');
      const fork = jest.spyOn(state.conversations, 'forkConversation');
      await askTwoModels(state);
      expect(ensure).toHaveBeenCalledTimes(1);
      const [rebuilt] = ensure.mock.calls[0]!;
      expect(rebuilt.history?.history).not.toHaveLength(0);
      expect(fork).toHaveBeenCalledTimes(1);
      expect(fork.mock.calls[0]![0]).toMatchObject({
        from: { lane: rebuilt.lane, boundary: 'pi:imported' },
      });
      expect(state.conversations.submit).toHaveBeenCalledTimes(2);
    } finally {
      await state.host.close();
    }
  });

  test('a follow-up reads the tail of only the copy that ran the selected answer', async () => {
    const state = fixture();
    const original = await state.reserve('completed');
    await state.host.initialize();
    try {
      await state.host.retryMessage({
        sessionId: state.sessionId,
        messageId: original.assistantMessageId,
      });
      const [lane] = (state.conversations.submit as jest.Mock).mock.calls.at(-1)!;
      expect(lane).toEqual(runtimeLane(state.sessionId, 1));
      const sibling = state.copies.get(laneKey(lane))!.turns.at(-1)!;
      state.emit({ ...sibling, status: 'completed', answerBoundary: 'pi:2' });
      await state.host.quiesce();
      const history = jest.spyOn(state.conversations, 'history');
      await state.host.submitMessage({
        sessionId: state.sessionId,
        userMessageId: uuid(),
        assistantMessageId: uuid(),
        parts: [{ type: 'text', text: 'Follow up' }],
      });
      expect((state.conversations.submit as jest.Mock).mock.calls.at(-1)![0]).toEqual(lane);
      expect(history.mock.calls.map(([read]) => read)).toEqual([lane]);
    } finally {
      await state.host.close();
    }
  });

  test('selecting a message publishes the Session with its new selected leaf', async () => {
    const state = fixture();
    const first = await state.reserve('completed');
    await state.host.initialize();
    try {
      const events: AgentEvent[] = [];
      const observation = await state.host.observeSession(state.sessionId, (event) =>
        events.push(event),
      );
      const session = await state.host.selectMessage({
        sessionId: state.sessionId,
        messageId: first.userMessageId,
      });
      expect(session.activeNodeId).toBe(first.assistantMessageId);
      expect(events).toContainEqual({ type: 'session.updated', session });
      observation.unsubscribe();
      await expect(
        state.host.selectMessage({ sessionId: state.sessionId, messageId: uuid() }),
      ).rejects.toMatchObject({ view: { code: 'MESSAGE_NOT_FOUND' } });
    } finally {
      await state.host.close();
    }
  });

  test('carries selected Skill instructions in the system prompt, including on retry', async () => {
    const skillId = '00000000-0000-4000-8000-000000000123';
    const scope: SkillTurnScope = {
      entries: [
        {
          id: skillId,
          name: 'outline',
          description: 'Outline a document',
          invocation: { modelInvocable: true, userInvocable: true },
          contentHash: 'directory-sha256:abc',
          folderName: 'outline',
          files: ['SKILL.md'],
          limitations: { scripts: [], unavailableTools: [] },
        },
      ],
      readInstructions: async () => 'Use a concise outline.',
      readFile: async () => null,
    };
    const selection = {
      skillId,
      name: 'outline',
      contentHash: 'directory-sha256:abc',
      origin: 'explicit' as const,
    };
    const state = fixture({ skills: { resolve: async () => scope } });
    const ensure = jest.spyOn(state.conversations, 'ensureConversation');
    const failed = await state.reserve('failed', [
      {
        id: 'question',
        type: 'text',
        text: 'Question outline',
        state: 'done',
        skillSelections: [selection],
        skillReferences: [{ type: 'skill', skillId, label: 'outline', offset: 9 }],
      },
    ]);
    await state.host.initialize();
    try {
      await state.host.retryMessage({
        sessionId: state.sessionId,
        messageId: failed.assistantMessageId,
      });
      // Retry rebuilds the working copy; the original selection must configure it again.
      expect(ensure.mock.lastCall?.[0].configuration.initialInstructions).toEqual([
        { key: `skill:${skillId}`, text: expect.stringContaining('Use a concise outline.') },
      ]);
      const [user] = await state.store.listMessages(state.sessionId);
      expect(user.parts[0]).toMatchObject({
        skillSelections: [selection],
        skillReferences: [{ type: 'skill', skillId, label: 'outline', offset: 9 }],
      });
    } finally {
      await state.host.close();
    }
  });

  test('keeps a plugin guide loaded in an earlier turn in the next turn system context', async () => {
    const pluginTool: RuntimeTool = {
      ref: { source: 'mcp', serverId: 'feishu-1', rawToolName: 'fetch-doc' },
      providerName: 'mcp_feishu_fetch_doc',
      displayName: 'Fetch document',
      description: '',
      inputSchema: { type: 'object' },
      approval: 'auto',
      execute: async () => ({ value: null, artifacts: [] }),
    };
    const guide = { pluginId: 'feishu', serverId: 'feishu-1', revision: 5, content: 'Read first.' };
    const state = fixture({
      runtimeTools: { resolve: async () => ({ tools: [pluginTool], pluginGuides: [guide] }) },
    });
    const configure = jest.spyOn(state.conversations, 'configure');
    const turn = await state.reserve();
    turn.parts.push({
      id: 'load',
      type: 'tool',
      toolCallId: 'load',
      toolRef: { source: 'builtin', capabilityId: 'load_workflow' },
      providerName: 'load_workflow',
      displayName: 'load_workflow',
      state: 'output-available',
      input: { workflow_id: 'plugin:feishu-1' },
      output: { value: { status: 'ok', workflow_id: 'plugin:feishu-1' }, artifacts: [] },
    });
    await state.host.initialize();
    try {
      await state.host.submitMessage({
        sessionId: state.sessionId,
        userMessageId: uuid(),
        assistantMessageId: uuid(),
        parts: [{ type: 'text', text: 'Update the same document.' }],
      });
      expect(configure.mock.lastCall?.[1].initialInstructions).toEqual([
        { key: 'workflow:plugin:feishu-1', text: expect.stringContaining('Read first.') },
      ]);
    } finally {
      await state.host.close();
    }
  });

  test('settles completed native results at startup and keeps the idle working copy', async () => {
    const { traces, records } = createTraceRecorder();
    const state = fixture({ traces });
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
      expect(state.host.getSessionStatus(state.sessionId)).toBeNull();
      expect(
        records.filter((record) => record.name === 'ai.turn_state' && record.revision === 2),
      ).toEqual([
        expect.objectContaining({
          status: 'ok',
          context: {
            sessionId: turn.identity.sessionId,
            turnId: turn.identity.turnId,
            requestId: turn.identity.requestId,
            messageId: turn.assistantMessageId,
          },
          attributes: { 'agent.turn.status': 'completed' },
        }),
      ]);
    } finally {
      await state.host.close();
    }
  });

  test('settles results emitted during stale-copy retirement before accepting new input', async () => {
    const state = fixture();
    const running = await state.reserve('running');
    state.copies.set('deleted-owner', { revision: 0, turns: [] });
    jest.spyOn(state.conversations, 'discardConversation').mockImplementation(async (lane) => {
      state.copies.delete(laneKey(lane));
      state.emit({ ...running, status: 'completed' });
    });
    await state.host.initialize();
    try {
      expect(state.conversations.discardConversation).toHaveBeenCalledWith(
        runtimeLane('deleted-owner'),
      );
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
    const { assistantMessageId } = await state.reserve();
    const reservedAt = Date.parse(
      (await state.store.getMessage(state.sessionId, assistantMessageId))!.createdAt,
    );
    const finalize = jest.spyOn(state.store, 'finalizeAssistantMessage');
    state.copies.clear();
    state.copies.set('deleted-owner', { revision: 0, turns: [] });
    const now = jest.spyOn(Date, 'now').mockReturnValue(reservedAt + 60_000);
    await state.host.initialize();
    now.mockRestore();
    try {
      expect((await state.store.listMessages(state.sessionId)).at(-1)?.status).toBe('interrupted');
      // Administrative recovery keeps the reservation's activity time.
      expect(finalize).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeStats: {
            runtimeTiming: { startedAt: reservedAt, completedAt: reservedAt, spans: [] },
          },
        }),
      );
      expect(await state.store.getSession('deleted-owner')).toBeNull();
      expect(state.conversations.discardConversation).toHaveBeenCalledWith(
        runtimeLane('deleted-owner'),
      );
    } finally {
      await state.host.close();
    }
  });

  test('publishes a terminal event only after the complete assistant row commits', async () => {
    const { traces, records } = createTraceRecorder();
    const state = fixture({ traces });
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
    expect(
      records.filter(
        (record) =>
          record.name === 'ai.turn_state' &&
          record.revision === 2 &&
          record.attributes['agent.turn.status'] === 'completed',
      ),
    ).toHaveLength(1);
    await state.host.close();
  });

  test('a failed terminal write leaves a recoverable pending row and blocks premature completion', async () => {
    const { traces, records } = createTraceRecorder();
    const state = fixture({ traces });
    const running = await state.reserve('running');
    await state.host.initialize();
    const events: AgentEvent[] = [];
    await state.host.observeSession(state.sessionId, (event) => events.push(event));
    jest
      .spyOn(state.store, 'finalizeAssistantMessage')
      .mockRejectedValueOnce(Object.assign(new Error('disk full'), { code: 'SQLITE_FULL' }));
    state.emit({ ...running, status: 'completed' });
    await state.host.quiesce();
    expect(events.filter((event) => event.type === 'message.finalized')).toHaveLength(1);
    expect((await state.store.listMessages(state.sessionId)).at(-1)?.status).toBe('success');
    expect(state.copies.has(state.sessionId)).toBe(true);
    const writes = records.filter(
      (record) => record.name === 'ai.settlement' && record.revision === 2,
    );
    expect(writes.map((record) => record.status)).toEqual(['error', 'ok']);
    expect(writes[0]).toMatchObject({
      context: {
        sessionId: running.identity.sessionId,
        turnId: running.identity.turnId,
        requestId: running.identity.requestId,
        messageId: running.assistantMessageId,
      },
      attributes: { 'error.code': 'SQLITE_FULL' },
    });
    expect(JSON.stringify(writes)).not.toContain('disk full');
    expect(
      records.filter(
        (record) =>
          record.name === 'ai.turn_state' &&
          record.revision === 2 &&
          record.attributes['agent.turn.status'] === 'completed',
      ),
    ).toHaveLength(1);
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
      expect(state.conversations.discardConversation).toHaveBeenCalledWith(
        runtimeLane(state.sessionId),
      );
      expect(await state.store.listMessages(state.sessionId)).toEqual([]);
    } finally {
      await state.host.close();
    }
  });
});
