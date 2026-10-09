import type { Api, AssistantMessage, Model, TranscriptContext } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { MemoryStorage } from '@earendil-works/pi-durable';

import type {
  RuntimeConversationEvent,
  RuntimeDurableSubmission,
  RuntimeExecutionPorts,
  RuntimeSqlDatabase,
} from '../../durableTypes';
import { PiDurableAgentRuntime } from '../PiDurableAgentRuntime';
import type { PiRuntimeDependencies } from '../piModelTypes';
import { emptyAssistantMessage } from '../piStreamEvents';

class ReopenableMemoryStorage extends MemoryStorage {
  override async close(): Promise<void> {}
}
const reference = { providerId: 'provider', modelId: 'model' };
const wire: Model<Api> = {
  api: 'openai-responses',
  provider: 'provider',
  id: 'wire-model',
  name: 'Model',
  baseUrl: '',
  contextWindow: 32768,
  maxTokens: 4096,
  input: ['text'],
  reasoning: false,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const seed = {
  sessionId: 'session',
  revision: 0,
  configuration: { model: reference, instructions: 'Help.', options: {}, tools: [] },
};

function input(id: string): RuntimeDurableSubmission {
  return {
    requestId: id,
    turnId: `turn-${id}`,
    userMessageId: `user-${id}`,
    assistantMessageId: `answer-${id}`,
    createdAt: 1,
    input: [{ type: 'text', text: `Question ${id}` }],
    metadata: { originalText: `Question ${id}` },
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture() {
  const storage = new ReopenableMemoryStorage();
  const requests: TranscriptContext[] = [];
  const ports: RuntimeExecutionPorts = {
    assertExecutionAllowed: jest.fn(async () => undefined),
    resolveTool: jest.fn(async () => {
      throw new Error('No tools.');
    }),
    requestApproval: jest.fn(async () => 'deny' as const),
    admitArtifacts: jest.fn(async () => undefined),
    recordUsage: jest.fn(async () => undefined),
  };
  const dependencies: PiRuntimeDependencies = {
    preflightModel: async () => ({
      contextWindow: 32768,
      maxInputTokens: 28672,
      maxOutputTokens: 4096,
      inputModalities: ['text'],
      supportsTools: true,
    }),
    resolveModel: async () => ({
      model: wire,
      defaultThinkingLevel: 'off',
      redactionValues: [],
      supportsTools: true,
      usageContext: {
        providerId: 'provider',
        providerName: null,
        modelId: 'model',
        modelName: null,
        pricingSnapshot: null,
        trustProviderReportedCost: false,
        reportedCostCurrency: null,
        credentialReceipt: { attribution: 'unknown' },
      },
      streamFn: (_model, context) => {
        requests.push(context);
        const message: AssistantMessage = {
          ...emptyAssistantMessage(wire),
          content: [{ type: 'text', text: `Response ${requests.length}` }],
          usage: {
            input: 3,
            output: 2,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 5,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
        };
        const stream = new AssistantMessageEventStream();
        stream.push({ type: 'done', reason: 'stop', message });
        return stream;
      },
    }),
  };
  // The native Storage injection owns persistence in this fixture; SQL must never be called here.
  const unavailable = async () => {
    throw new Error('Unexpected SQL in the memory fixture.');
  };
  const database: RuntimeSqlDatabase = {
    exec: unavailable,
    run: unavailable,
    get: unavailable,
    all: unavailable,
    transaction: unavailable,
    close: unavailable,
  };
  const create = () => new PiDurableAgentRuntime(dependencies, async () => storage);
  return { storage, requests, ports, database, create, dependencies };
}

async function submitAndWait(runtime: PiDurableAgentRuntime, submission: RuntimeDurableSubmission) {
  const complete = deferred<void>();
  const observation = await runtime.observe('session', (event) => {
    if (
      event.type === 'turn.updated' &&
      event.turn.identity.requestId === submission.requestId &&
      event.turn.status === 'completed'
    )
      complete.resolve();
  });
  try {
    await runtime.submit('session', submission);
    await complete.promise;
  } finally {
    await observation.unsubscribe();
  }
}

describe('Persistent Agent facade', () => {
  test('attributes generation to its invocation even when the request ID differs from message aliases', async () => {
    const state = fixture();
    const runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    try {
      await runtime.ensureConversation(seed);
      await submitAndWait(runtime, input('owning-request'));
      await runtime.drainUsage();
      expect(state.ports.recordUsage).toHaveBeenCalledWith(
        {
          sessionId: 'session',
          turnId: 'turn-owning-request',
          requestId: 'owning-request',
        },
        expect.objectContaining({ usage: expect.objectContaining({ totalTokens: 5 }) }),
      );
    } finally {
      await runtime.close();
    }
  });

  test('opening completed history does not reconstruct old model registrations or execute requests', async () => {
    const state = fixture();
    let runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    await runtime.ensureConversation(seed);
    await submitAndWait(runtime, input('finished'));
    await runtime.close();
    const preflight = jest.spyOn(state.dependencies, 'preflightModel');
    runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    try {
      expect((await runtime.history('session', { limit: 1 })).turns).toHaveLength(1);
      expect(preflight).not.toHaveBeenCalled();
      expect(state.requests).toHaveLength(1);
    } finally {
      await runtime.close();
      preflight.mockRestore();
    }
  });
  test('reopens an existing working copy and continues without replaying tools', async () => {
    const fixtureState = fixture();
    let runtime = fixtureState.create();
    await runtime.initialize(fixtureState.database, fixtureState.ports);
    try {
      await runtime.ensureConversation(seed);
      expect(await runtime.sessions()).toEqual([{ sessionId: 'session', revision: 0 }]);
      await submitAndWait(runtime, input('first'));
      expect(await runtime.sessions()).toEqual([{ sessionId: 'session', revision: 0 }]);
      await runtime.close();
      runtime = fixtureState.create();
      await runtime.initialize(fixtureState.database, fixtureState.ports);
      expect(fixtureState.requests).toHaveLength(1);
      // The Host reconstructs the current configuration before each idle submission.
      await runtime.configure('session', seed.configuration);
      await submitAndWait(runtime, input('second'));
      expect(
        fixtureState.requests[1]?.messages
          .filter((message) => message.role === 'user')
          .map((message) => message.content),
      ).toEqual(['Question first', 'Question second']);
      expect(await runtime.message('session', 'answer-first')).toMatchObject({
        role: 'assistant',
        turn: { status: 'completed', parts: [{ text: 'Response 1' }] },
      });
      expect(fixtureState.ports.recordUsage).toHaveBeenCalledWith(
        { sessionId: 'session', turnId: 'turn-first', requestId: 'first' },
        expect.objectContaining({
          usage: {
            inputTokens: 3,
            outputTokens: 2,
            totalTokens: 5,
            noCacheTokens: 3,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
        }),
      );
    } finally {
      await runtime.close();
    }
  });

  test('exports exact replay, then rebuilds independent history without model requests', async () => {
    const state = fixture();
    const runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    try {
      await runtime.ensureConversation(seed);
      await submitAndWait(runtime, input('first'));
      const { replay } = await runtime.exportTurn('session', 'first');
      expect(replay).toMatchObject({
        version: 1,
        payload: {
          messages: [
            expect.objectContaining({
              role: 'assistant',
              content: [{ type: 'text', text: 'Response 1' }],
            }),
          ],
        },
      });
      await runtime.discardConversation('session');
      expect(await runtime.hasConversation('session')).toBe(false);
      await runtime.ensureConversation({
        ...seed,
        revision: 1,
        history: {
          history: [
            {
              turnId: 'first',
              messages: [{ role: 'user', parts: [{ type: 'text', text: 'Question first' }] }],
              replay: replay!,
            },
          ],
          contextCheckpoint: null,
          referencedFileEntryIds: ['retained-file'],
        },
      });
      expect(state.requests).toHaveLength(1);
      expect(await runtime.resourceFileEntryIds('session')).toEqual(['retained-file']);
      await submitAndWait(runtime, input('next'));
      expect(state.requests[1]?.messages).toContainEqual(
        expect.objectContaining({
          role: 'assistant',
          content: [{ type: 'text', text: 'Response 1' }],
        }),
      );
    } finally {
      await runtime.close();
    }
  });

  test('detaching a UI observer preserves the active native execution', async () => {
    const state = fixture();
    const runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    try {
      await runtime.ensureConversation(seed);
      const events: RuntimeConversationEvent[] = [];
      const observation = await runtime.observe('session', (event) => events.push(event));
      await observation.unsubscribe();
      await submitAndWait(runtime, input('first'));
      expect(events).toEqual([]);
      expect(await runtime.message('session', 'answer-first')).toMatchObject({
        turn: { status: 'completed' },
      });
    } finally {
      await runtime.close();
    }
  });
});
