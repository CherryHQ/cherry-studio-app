import { v7 as uuid } from 'uuid';

import type { AgentEvent } from '@/shared/contracts/agent';
import { createUniqueModelId } from '@/shared/data/types/model';

import { FakeRuntime } from '../../runtime';
import type {
  DurableAgentRuntime,
  RuntimeConversationEvent,
  RuntimeDurableTurn,
  RuntimeExecutionPorts,
} from '../../runtime';
import { InMemoryAgentSessionStore } from '../../sessionStore/InMemoryAgentSessionStore';
import { DurableAgentHost } from '../DurableAgentHost';
import type { MobileAgentHostPorts } from '../MobileAgentHost';

function fixture() {
  const store = new InMemoryAgentSessionStore();
  const agentId = uuid();
  const sessionId = uuid();
  const steps: string[] = [];
  const project = store.projectSession.bind(store);
  jest.spyOn(store, 'projectSession').mockImplementation(async (seed) => {
    steps.push('project');
    return project(seed);
  });
  let execution: RuntimeExecutionPorts | undefined;
  let emit: ((event: RuntimeConversationEvent) => void) | undefined;
  const conversations = {
    descriptor: new FakeRuntime().descriptor,
    initialize: jest.fn(async (_database, ports: RuntimeExecutionPorts) => {
      execution = ports;
    }),
    creationSeeds: async () => [
      {
        sessionId,
        metadata: {
          id: sessionId,
          agentId,
          executionTarget: { kind: 'local' },
          title: 'Recovered',
          titleIsManual: false,
          createdAt: 10,
          lastActivityAt: 10,
          forkedFromSessionId: null,
          forkBoundaryMessageId: null,
        },
      },
    ],
    unfinishedSessions: async () => [],
    watchWork: async () => ({ active: false, unsubscribe: async () => {} }),
    resume: jest.fn(() => {
      steps.push('resume');
    }),
    close: jest.fn(async () => {}),
    abort: jest.fn(async () => {}),
    hasConversation: async () => true,
    observe: async (_sessionId: string, listener: (event: RuntimeConversationEvent) => void) => {
      emit = listener;
      return {
        snapshot: { activeTurn: null, queue: [], legacy: null },
        unsubscribe: async () => {},
      };
    },
  } as unknown as DurableAgentRuntime;
  const ports: MobileAgentHostPorts = {
    agents: {
      getAgent: async (id) =>
        id === agentId
          ? {
              id,
              name: 'Agent',
              instructions: '',
              model: { providerId: 'provider', modelId: 'model' },
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
      open: async () => {
        throw new Error('mock opened below');
      },
      capture: async () => {},
      notifyTranscript: () => {
        steps.push('business-ready');
      },
    },
    recordDurableUsage: async () => {},
  };
  // Native initialization owns this opaque connection. These lifecycle cases exercise no SQL method.
  ports.durableStorage!.open = jest.fn(async () => ({}) as never);
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
  return {
    host,
    store,
    conversations,
    sessionId,
    steps,
    execution: () => execution,
    emit: (event: RuntimeConversationEvent) => emit?.(event),
  };
}

describe('Persistent Host recovery and disposal', () => {
  test('repairs an admitted creation seed before upstream scheduling without message rows', async () => {
    const state = fixture();
    await state.host.initialize();
    try {
      expect(state.steps).toEqual(['project', 'resume', 'business-ready']);
      expect(await state.store.getSession(state.sessionId)).toMatchObject({ title: 'Recovered' });
      expect(await state.store.listMessages(state.sessionId)).toEqual([]);
      expect(state.execution()).toBeDefined();
    } finally {
      await state.host.close();
    }
  });

  test('a settled native turn joins the message full-text index with only its visible text', async () => {
    const state = fixture();
    await state.host.initialize();
    const observation = await state.host.observeSession(state.sessionId, () => {});
    const turn: RuntimeDurableTurn = {
      identity: { sessionId: state.sessionId, turnId: 'turn', requestId: 'turn' },
      userMessageId: uuid(),
      assistantMessageId: uuid(),
      inputBoundary: 'pi:1',
      answerBoundary: 'pi:2',
      status: 'completed',
      hasAssistant: true,
      usage: null,
      error: null,
      createdAt: 20,
      updatedAt: 30,
      parts: [
        { id: 'thinking', type: 'reasoning', text: 'hidden', state: 'done' },
        { id: 'answer', type: 'text', text: 'Indexed answer', state: 'done' },
      ],
      metadata: {
        userParts: [{ id: 'question', type: 'text', text: 'Indexed question', state: 'done' }],
        referencedFileEntryIds: [],
        hasHistoryBeforeActiveTurn: false,
        inferenceSnapshot: {
          version: 1,
          model: {
            uniqueModelId: 'provider::model',
            providerId: 'provider',
            modelId: 'model',
            name: 'Model',
          },
          parameters: {},
          tools: [],
        },
      },
    };
    try {
      state.emit({ type: 'turn.updated', turn });
    } finally {
      observation.unsubscribe();
      await state.host.close();
    }
    expect(
      (await state.store.listMessages(state.sessionId)).map(({ id, role, status, parts }) => ({
        id,
        role,
        status,
        parts,
      })),
    ).toEqual([
      {
        id: turn.userMessageId,
        role: 'user',
        status: 'success',
        parts: [{ id: 'question', type: 'text', text: 'Indexed question', state: 'done' }],
      },
      {
        id: turn.assistantMessageId,
        role: 'assistant',
        status: 'success',
        parts: [{ id: 'answer', type: 'text', text: 'Indexed answer', state: 'done' }],
      },
    ]);
  });

  test('ordinary disposal joins once and never writes an explicit stop', async () => {
    const state = fixture();
    await state.host.initialize();
    await Promise.all([state.host.close(), state.host.close()]);
    expect(state.conversations.close).toHaveBeenCalledTimes(1);
    expect(state.conversations.abort).not.toHaveBeenCalled();
  });

  test('archive performs an explicit stop and keeps the source readable for history lineage', async () => {
    const state = fixture();
    await state.host.initialize();
    try {
      await state.host.deleteSession({ sessionId: state.sessionId });
      expect(state.conversations.abort).toHaveBeenCalledWith(state.sessionId);
      expect(await state.store.isSessionArchived(state.sessionId)).toBe(true);
      const observation = await state.host.observeSession(
        state.sessionId,
        (_event: AgentEvent) => {},
      );
      expect(observation.snapshot.session.id).toBe(state.sessionId);
      observation.unsubscribe();
    } finally {
      await state.host.close();
    }
  });
});
