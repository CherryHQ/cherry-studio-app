import type { Api, AssistantMessage, Model, TranscriptContext } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { MemoryStorage } from '@earendil-works/pi-durable';

import { buildAgentSystemPrompt } from '../../../host/agentSystemPrompt';
import type { SkillTurnEntry, SkillTurnScope } from '../../../host/skillScope';
import { createSkillTools } from '../../../tools/skill/skillTools';
import type {
  RuntimeConversationEvent,
  RuntimeDurableSubmission,
  RuntimeExecutionPorts,
  RuntimeSqlDatabase,
} from '../../durableTypes';
import type { RuntimeTool } from '../../types';
import { bindPiStream, resolvePiApiAdapter } from '../piApiAdapters';
import { PiDurableAgentRuntime } from '../PiDurableAgentRuntime';
import type { PiRuntimeDependencies, PiStreamFn } from '../piModelTypes';
import { emptyAssistantMessage } from '../piStreamEvents';
import { withPiStreamIdleTimeout } from '../piStreamIdleTimeout';

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
  test.each(['openai-completions', 'openai-responses'] as const)(
    'retains explicit Skill instructions, built-in tools, MCP discovery and user input in the serialized %s request',
    async (api) => {
      const state = fixture();
      const execute = jest.fn(async () => ({ value: null, artifacts: [] }));
      const selectedSkill: SkillTurnEntry = {
        id: '12345678-1234-4234-8234-123456789abc',
        name: 'grill-me',
        description: 'Interview the user about a plan.',
        invocation: { modelInvocable: true, userInvocable: true },
        contentHash: 'abcdef0123456789',
        folderName: 'grill-me',
        files: ['SKILL.md'],
        admission: { status: 'ready', reasons: [] },
      };
      const selectedInstructions =
        'Ask one question at a time. Recommend an answer for each question.';
      const availableInstructions = 'Write a detailed launch checklist before answering.';
      const scope: SkillTurnScope = {
        entries: [
          selectedSkill,
          {
            ...selectedSkill,
            id: '23456789-2345-4345-8345-23456789abcd',
            name: 'launch-checklist',
          },
        ],
        readInstructions: async (id) =>
          id === selectedSkill.id ? selectedInstructions : availableInstructions,
        readFile: async () => null,
      };
      const tools: RuntimeTool[] = [
        {
          ref: { source: 'builtin', capabilityId: 'run_js' },
          providerName: 'run_js',
          displayName: 'Run JavaScript',
          description: 'Run a local calculation.',
          inputSchema: { type: 'object', properties: {} },
          approval: 'auto',
          execute,
        },
        ...createSkillTools(scope, { loadedSkillIds: [selectedSkill.id] }),
        {
          ref: { source: 'mcp', serverId: 'github', rawToolName: 'get_me' },
          providerName: 'mcp_github_get_me',
          displayName: 'GitHub account',
          description: 'GitHub: Get the authenticated account.',
          inputSchema: { type: 'object', properties: {} },
          approval: 'ask',
          execute,
        },
      ];
      const instructions = buildAgentSystemPrompt({
        agentInstructions: 'Help me inspect my GitHub repositories.',
        appLanguage: 'zh-CN',
        currentDate: '2026-10-09',
        tools,
        skills: {
          scope,
          selected: [{ entry: selectedSkill, instructions: selectedInstructions }],
        },
        pluginGuides: [
          {
            pluginId: 'github',
            revision: 3,
            serverId: 'github',
            content: '# GitHub\nUse get_me for account context.',
          },
        ],
      });
      const adapter = resolvePiApiAdapter(
        api === 'openai-completions' ? 'openai-chat-completions' : 'openai-responses',
      );
      const { streamSimple } = jest.requireActual<{ streamSimple: PiStreamFn }>(
        `${process.cwd()}/node_modules/@earendil-works/pi-ai/dist/api/${api}.js`,
      );
      // Jest loads the same installed adapter through CommonJS; Metro uses its import entry.
      const loadStream = jest.spyOn(adapter, 'loadStreamSimple').mockResolvedValue(streamSimple);
      const capture = await bindPiStream(adapter, {
        apiKey: 'test-key',
        fetch: async () => {
          throw new Error('This test must not contact a provider.');
        },
        headers: {},
        maxRetries: 0,
        maxTokens: 4096,
      });
      let payload: unknown;
      const resolveModel = state.dependencies.resolveModel;
      state.dependencies.resolveModel = async (...args) => {
        const resolved = await resolveModel(...args);
        return {
          ...resolved,
          model: { ...wire, api, compat: { supportsDeveloperRole: false } },
          streamFn: async (model, context, options) => {
            const serialized = await capture(model, context, {
              ...options,
              onPayload: (request) => {
                payload = request;
                throw new Error('Request captured before transport.');
              },
            });
            await serialized.result();
            return resolved.streamFn(model, context, options);
          },
        };
      };
      const runtime = state.create();
      await runtime.initialize(state.database, state.ports);
      try {
        await runtime.ensureConversation({
          ...seed,
          configuration: { ...seed.configuration, instructions, tools },
        });
        const text = '你看看我的 github 的 skenora 项目';
        await submitAndWait(runtime, { ...input('first'), input: [{ type: 'text', text }] });
        const serialized = JSON.stringify(payload);
        expect(serialized).toContain(text);
        expect(serialized).toContain('# Cherry Studio Mobile Runtime');
        expect(serialized).toContain('2026-10-09');
        expect(serialized).toContain('zh-CN');
        expect(serialized).toContain('Help me inspect my GitHub repositories.');
        expect(serialized).toContain('## JavaScript Sandbox');
        expect(serialized).toContain('# GitHub');
        expect(serialized).toContain('## MCP Tool Discovery');
        expect(serialized).toContain('grill-me');
        expect(serialized).toContain(selectedInstructions);
        expect(serialized).toContain('launch-checklist');
        expect(serialized).not.toContain(availableInstructions);
        const request = payload as {
          tools: { name?: string; function?: { name: string } }[];
          messages?: { role: string }[];
          input?: { role?: string }[];
        };
        expect(request.tools.map((tool) => tool.name ?? tool.function?.name)).toEqual([
          'run_js',
          'search_local_skills',
          'load_skill',
          'list_skill_files',
          'read_skill_file',
          'tool_search',
          'tool_describe',
          'tool_call',
        ]);
        expect((request.messages ?? request.input)?.map((message) => message.role)).toEqual([
          'system',
          'user',
        ]);
        expect(execute).not.toHaveBeenCalled();
      } finally {
        await runtime.close();
        loadStream.mockRestore();
      }
    },
  );

  test('stopping a streamed partial settles the task and preserves the answer across reopen', async () => {
    const state = fixture();
    const resolveModel = state.dependencies.resolveModel;
    let signal: AbortSignal | undefined;
    state.dependencies.resolveModel = async (...args) => ({
      ...(await resolveModel(...args)),
      streamFn: withPiStreamIdleTimeout((_model, _context, options) => {
        signal = options?.signal;
        const stream = new AssistantMessageEventStream();
        const partial = {
          ...emptyAssistantMessage(wire),
          content: [{ type: 'text' as const, text: 'Partial answer' }],
        };
        stream.push({ type: 'text_delta', contentIndex: 0, delta: 'Partial answer', partial });
        // The provider deliberately ignores abort; the app adapter still owns terminal delivery.
        return stream;
      }),
    });
    let runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    await runtime.ensureConversation(seed);
    const partial = deferred<void>();
    const stopped = deferred<void>();
    const observation = await runtime.observe('session', (event) => {
      if (event.type !== 'turn.updated') return;
      if (event.turn.parts.some((part) => part.type === 'text' && part.text === 'Partial answer'))
        partial.resolve();
      if (event.turn.status === 'cancelled') stopped.resolve();
    });
    try {
      await runtime.submit('session', input('stopped'));
      await partial.promise;
      await runtime.abort('session');
      await stopped.promise;
      expect(signal?.aborted).toBe(true);
      expect(await runtime.hasUnfinishedWork()).toBe(false);
      await observation.unsubscribe();
      await runtime.close();
      runtime = state.create();
      await runtime.initialize(state.database, state.ports);
      expect((await runtime.message('session', 'answer-stopped'))?.turn).toMatchObject({
        status: 'cancelled',
        parts: [{ type: 'text', text: 'Partial answer', state: 'done' }],
      });
      expect(await runtime.hasUnfinishedWork()).toBe(false);
    } finally {
      await observation.unsubscribe();
      await runtime.close();
    }
  });
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

  test('rebuilds independent history from Cherry parts without model requests', async () => {
    const state = fixture();
    const runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    try {
      await runtime.ensureConversation(seed);
      await submitAndWait(runtime, input('first'));
      expect(await runtime.exportTurn('session', 'first')).toEqual({ contextCheckpoint: null });
      await runtime.discardConversation('session');
      expect(await runtime.hasConversation('session')).toBe(false);
      await runtime.ensureConversation({
        ...seed,
        revision: 1,
        history: {
          history: [
            {
              turnId: 'first',
              messages: [
                { role: 'user', parts: [{ type: 'text', text: 'Question first' }] },
                {
                  role: 'assistant',
                  parts: [
                    { type: 'reasoning', text: 'Unsigned thought, never resent.' },
                    { type: 'text', text: 'Response 1' },
                  ],
                },
              ],
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
      expect(JSON.stringify(state.requests[1]?.messages)).not.toContain('Unsigned thought');
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
