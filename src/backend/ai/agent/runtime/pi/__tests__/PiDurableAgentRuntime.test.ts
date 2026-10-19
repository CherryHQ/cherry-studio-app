import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { Api, AssistantMessage, Model, TranscriptContext } from '@earendil-works/pi-ai';
import { streamSimple as streamAnthropic } from '@earendil-works/pi-ai/api/anthropic-messages';
import { streamSimple as streamGoogle } from '@earendil-works/pi-ai/api/google-generative-ai';
import { streamSimple as streamCompletions } from '@earendil-works/pi-ai/api/openai-completions';
import { streamSimple as streamResponses } from '@earendil-works/pi-ai/api/openai-responses';
import { createModels } from '@earendil-works/pi-ai/models';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { getCurrentSystemPrompt, getCurrentTools } from '@earendil-works/pi-ai/utils/transcript';
import {
  AgentDoc,
  createRegistry,
  defineDocFamily,
  GenerationTask,
  LiveDoc,
  MemoryStorage,
  SystemEntry,
  UserEntry,
  type JsonObject,
} from '@earendil-works/pi-durable';

import {
  buildAgentSystemPrompt,
  buildInitialSkillInstructions,
} from '../../../host/agentSystemPrompt';
import type { SkillTurnEntry, SkillTurnScope } from '../../../host/skillScope';
import { createSkillTools } from '../../../tools/skill/skillTools';
import { createLoadWorkflowTool, getPluginWorkflows } from '../../../tools/workflowTool';
import type {
  RuntimeConversationEvent,
  RuntimeDurableSubmission,
  RuntimeExecutionPorts,
  RuntimeSqlDatabase,
} from '../../durableTypes';
import type { RuntimeTool } from '../../types';
import { bindPiStream, resolvePiApiAdapter } from '../piApiAdapters';
import { PiDurableAgentRuntime } from '../PiDurableAgentRuntime';
import { piSubmissionMetadata, piToolBlueprint } from '../piDurableProjection';
import { PiDurableRuntime } from '../PiDurableRuntime';
import type { PiRuntimeDependencies, PiStreamFn } from '../piModelTypes';
import { emptyAssistantMessage, providerErrorEvent } from '../piStreamEvents';
import { withPiStreamIdleTimeout } from '../piStreamIdleTimeout';
import { ToolInstructions } from '../piToolInstructions';
import type { PiNativeWebTools } from '../piWebTools';

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

async function submitAndWait(
  runtime: PiDurableAgentRuntime,
  submission: RuntimeDurableSubmission,
  status: 'completed' | 'failed' = 'completed',
) {
  const complete = deferred<void>();
  const observation = await runtime.observe('session', (event) => {
    if (
      event.type === 'turn.updated' &&
      event.turn.identity.requestId === submission.requestId &&
      event.turn.status === status
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
  test('migrates an unfinished v1 conversation across midnight without resetting loaded instructions', async () => {
    const state = fixture();
    const now = jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 11, 31, 23, 59).getTime());
    const tools: RuntimeTool[] = [
      {
        ref: { source: 'builtin', capabilityId: 'find_skills' },
        providerName: 'find_skills',
        displayName: 'Find skills',
        description: 'Find available skills.',
        inputSchema: { type: 'object', properties: {} },
        approval: 'auto',
        deferred: true,
        execute: async () => {
          throw new Error('Recovery must not replay tools.');
        },
      },
    ];
    const instructions = buildAgentSystemPrompt({
      agentInstructions: 'Help.',
      appLanguage: 'en-US',
      tools,
    });
    const legacyInstructions = instructions.replace(
      '\n\n## Response Language\n',
      '\n\n## Current Date\n\nThe current local date is `2026-12-31`.\n\n## Response Language\n',
    );
    const initial = { key: 'skill:selected', text: 'Selected skill body.' };
    const loaded = { key: 'plugin:loaded', text: 'Guide loaded during the unfinished turn.' };
    const legacy = await PiDurableRuntime.open(state.storage, {
      models: createModels({
        authContext: { env: async () => undefined, fileExists: async () => false },
      }),
      registry: createRegistry(),
    });
    const runtime = state.create();
    try {
      const conversation = await legacy.ensureConversation({
        sessionId: seed.sessionId,
        revision: seed.revision,
        agent: {
          model: { provider: reference.providerId, modelId: reference.modelId },
          extensions: [{ name: 'cherry.capabilities:session' }],
          instructions: legacyInstructions,
        },
        configuration: {
          ...seed.configuration,
          version: 1,
          instructions: legacyInstructions,
          initialInstructions: [initial],
          tools: tools.map(piToolBlueprint),
        },
        initialInstructions: [initial],
      });
      // Seed a persisted run without scheduling it, as if the previous process closed before prepare.
      const submission = input('unfinished');
      const metadata = piSubmissionMetadata(submission, tools);
      const submissionMetadata = defineDocFamily<{ value: JsonObject }, JsonObject>({
        kind: 'cherry.submission',
        version: 1,
        scope: 'session',
        family: true,
        initial: (value) => ({ value }),
      });
      await conversation.commit(async (tx) => {
        const agent = await tx.doc(AgentDoc, conversation.id);
        agent.modelTools = { add: ['find_skills'] };
        const live = await tx.doc(LiveDoc, conversation.id);
        const retained = await tx.doc(ToolInstructions, conversation.id);
        retained.sections.push(loaded);
        await tx.doc(submissionMetadata, `${conversation.id}:${submission.requestId}`, metadata);
        const entry = await tx.appendEntry(UserEntry, conversation.id, {
          model: [{ role: 'user', content: 'Question unfinished', timestamp: Date.now() }],
        });
        await tx.appendEntry(SystemEntry, conversation.id, {
          model: [
            {
              role: 'system',
              content: '',
              sections: { instructions: `<instructions>\n${legacyInstructions}\n</instructions>` },
              timestamp: Date.now(),
            },
          ],
        });
        const record = await tx.createSubmission({
          conversationId: conversation.id,
          type: 'input',
          status: 'placed',
          requestId: submission.requestId,
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
        live.run = { taskId, inputs: [record.id] };
      }, BACKGROUND_CONTEXT);
      await legacy.close();

      now.mockReturnValue(new Date(2027, 0, 1, 0, 1).getTime());
      await runtime.initialize(state.database, state.ports);
      expect((await runtime.configuration(seed.sessionId)).instructions).toBe(instructions);
      expect(await runtime.unfinishedSessions()).toEqual([seed.sessionId]);
      expect(state.requests).toHaveLength(0);
      await runtime.close();

      // The migration is durable; reopening again must retain loaded content and tool selection.
      const inspection = await PiDurableRuntime.open(state.storage, {
        models: createModels({
          authContext: { env: async () => undefined, fileExists: async () => false },
        }),
        registry: createRegistry(),
      });
      try {
        expect(await inspection.configuration(seed.sessionId)).toMatchObject({
          version: 2,
          instructions,
        });
        const restored = (await inspection.conversation(seed.sessionId))!;
        await restored.commit(async (tx) => {
          const agent = await tx.doc(AgentDoc, restored.id);
          expect(agent.instructions).toBeUndefined();
          expect(agent.modelTools).toEqual({ add: ['find_skills'] });
          expect((await tx.doc(ToolInstructions, restored.id)).sections).toEqual([initial, loaded]);
        }, BACKGROUND_CONTEXT);
      } finally {
        await inspection.close();
      }

      await runtime.initialize(state.database, state.ports);
      const completed = deferred<void>();
      const observation = await runtime.observe(seed.sessionId, (event) => {
        if (event.type === 'turn.updated' && event.turn.status === 'completed') completed.resolve();
      });
      try {
        runtime.resume();
        await completed.promise;
        expect(state.requests).toHaveLength(1);
        const prompt = getCurrentSystemPrompt(state.requests[0]!.messages);
        expect(prompt.match(/# Cherry Studio Mobile Runtime/g)).toHaveLength(1);
        expect(prompt).toContain('2027-01-01');
        expect(prompt).not.toContain('2026-12-31');
        expect(prompt).toContain(initial.text);
        expect(prompt).toContain(loaded.text);
        expect(getCurrentTools(state.requests[0]!.messages).map((tool) => tool.name)).toContain(
          'find_skills',
        );
      } finally {
        await observation.unsubscribe();
      }
    } finally {
      await legacy.close();
      await runtime.close();
      now.mockRestore();
    }
  });

  test('replays an interrupted prepared request unchanged, then refreshes the date for new input', async () => {
    const state = fixture();
    const now = jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 11, 31, 23, 59).getTime());
    const started = deferred<void>();
    const resolveModel = state.dependencies.resolveModel;
    let interrupt = true;
    state.dependencies.resolveModel = async (...args) => {
      const resolved = await resolveModel(...args);
      return {
        ...resolved,
        streamFn: withPiStreamIdleTimeout((model, context, options) => {
          if (!interrupt) return resolved.streamFn(model, context, options);
          interrupt = false;
          state.requests.push(context);
          started.resolve();
          return new AssistantMessageEventStream();
        }),
      };
    };
    let runtime = state.create();
    try {
      await runtime.initialize(state.database, state.ports);
      await runtime.ensureConversation(seed);
      await runtime.submit('session', input('interrupted'));
      await started.promise;
      expect(getCurrentSystemPrompt(state.requests[0]!.messages)).toContain('2026-12-31');
      await runtime.close();

      now.mockReturnValue(new Date(2027, 0, 1, 0, 1).getTime());
      runtime = state.create();
      await runtime.initialize(state.database, state.ports);
      const completed = deferred<void>();
      const observation = await runtime.observe('session', (event) => {
        if (event.type === 'turn.updated' && event.turn.status === 'completed') completed.resolve();
      });
      try {
        runtime.resume();
        await completed.promise;
        expect(state.requests).toHaveLength(2);
        expect(state.requests[1]!.messages).toEqual(state.requests[0]!.messages);
      } finally {
        await observation.unsubscribe();
      }

      await submitAndWait(runtime, input('next'));
      const prompt = getCurrentSystemPrompt(state.requests[2]!.messages);
      expect(prompt).toContain('2027-01-01');
      expect(prompt).not.toContain('2026-12-31');
    } finally {
      await runtime.close();
      now.mockRestore();
    }
  });

  test.each(['openai-responses', 'openai-completions'] as const)(
    'preserves the %s request prefix across midnight and reopen, updating only the date',
    async (api) => {
      const state = fixture();
      const now = jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 11, 31, 23, 59).getTime());
      type Payload = { input?: unknown[]; messages?: unknown[] };
      const payloads: unknown[] = [];
      const stream = (
        api === 'openai-responses' ? streamResponses : streamCompletions
      ) as PiStreamFn;
      const resolveModel = state.dependencies.resolveModel;
      state.dependencies.resolveModel = async (...args) => {
        const resolved = await resolveModel(...args);
        return {
          ...resolved,
          model: {
            ...wire,
            api,
            baseUrl: 'https://provider.example.test/v1',
            compat: { supportsDeveloperRole: false, supportsMidConvoSystemMessages: true },
          },
          streamFn: async (model, context, options) => {
            const serialized = await stream(model, context, {
              ...options,
              apiKey: 'test-key',
              maxRetries: 0,
              fetch: async () => {
                throw new Error('This test must not contact a provider.');
              },
              onPayload: (payload) => {
                payloads.push(payload);
                throw new Error('Request captured before transport.');
              },
            });
            await serialized.result();
            return resolved.streamFn(model, context, options);
          },
        };
      };
      let runtime = state.create();
      try {
        await runtime.initialize(state.database, state.ports);
        await runtime.ensureConversation(seed);
        await submitAndWait(runtime, input('first'));
        const first = payloads[0] as Payload;
        expect(JSON.stringify(first)).toContain('2026-12-31');
        expect(JSON.stringify(first).indexOf('Help.')).toBeLessThan(
          JSON.stringify(first).indexOf('<current-date>'),
        );

        await runtime.close();
        now.mockReturnValue(new Date(2027, 0, 1, 0, 1).getTime());
        runtime = state.create();
        await runtime.initialize(state.database, state.ports);
        await runtime.configure('session', seed.configuration);
        await submitAndWait(runtime, input('second'));
        const firstItems = first.input ?? first.messages!;
        const second = payloads[1] as Payload;
        expect((second.input ?? second.messages!).slice(0, firstItems.length)).toEqual(firstItems);
        const updates = state.requests[1]!.messages.filter((message) => message.role === 'system');
        expect(updates).toHaveLength(2);
        expect(updates[1]!.sections).toEqual({
          'current-date':
            '<current-date>\nThe current local date is `2027-01-01`.\n</current-date>',
        });

        await submitAndWait(runtime, input('third'));
        expect(state.requests[2]!.messages.filter((message) => message.role === 'system')).toEqual(
          updates,
        );
      } finally {
        await runtime.close();
        now.mockRestore();
      }
    },
  );

  test('starts the next queued input after a terminal provider failure without resubmission', async () => {
    const state = fixture();
    const resolveModel = state.dependencies.resolveModel;
    const firstStream = new AssistantMessageEventStream();
    const started = deferred<void>();
    let calls = 0;
    state.dependencies.resolveModel = async (...args) => ({
      ...(await resolveModel(...args)),
      streamFn: () => {
        calls++;
        if (calls === 1) {
          started.resolve();
          return firstStream;
        }
        const stream = new AssistantMessageEventStream();
        stream.push({
          type: 'done',
          reason: 'stop',
          message: {
            ...emptyAssistantMessage(wire),
            stopReason: 'stop',
            content: [{ type: 'text', text: 'Second answer' }],
          },
        });
        return stream;
      },
    });
    const runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    await runtime.ensureConversation(seed);
    runtime.resume();
    const completed = deferred<void>();
    const observed = await runtime.observe(seed.sessionId, (event) => {
      if (
        event.type === 'turn.updated' &&
        event.turn.identity.requestId === 'second' &&
        event.turn.status === 'completed'
      )
        completed.resolve();
    });
    try {
      await runtime.submit(seed.sessionId, input('first'));
      await started.promise;
      await runtime.submit(seed.sessionId, input('second'));
      firstStream.push(
        providerErrorEvent(emptyAssistantMessage(wire), {
          message: 'Invalid request',
          retryable: false,
        }),
      );
      await completed.promise;
      const history = await runtime.history(seed.sessionId, { limit: 10 });
      expect(history.turns.map((turn) => [turn.identity.requestId, turn.status])).toEqual([
        ['second', 'completed'],
        ['first', 'failed'],
      ]);
      expect(calls).toBe(2);
    } finally {
      await observed.unsubscribe();
      await runtime.close();
    }
  });

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
        limitations: { scripts: [], unavailableTools: [] },
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
          ref: { source: 'builtin', capabilityId: 'read_file' },
          providerName: 'read_file',
          displayName: 'Read file',
          description: 'Read a local file.',
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
      const skills = {
        scope,
        selected: [{ entry: selectedSkill, instructions: selectedInstructions }],
      };
      const pluginGuides = [
        {
          pluginId: 'github',
          revision: 3,
          serverId: 'github',
          content: '# GitHub\nUse get_me for account context.',
          overview: 'GitHub repository and PR context; honor the requested branch.',
        },
      ];
      tools.push(createLoadWorkflowTool(getPluginWorkflows(pluginGuides)));
      const instructions = buildAgentSystemPrompt({
        agentInstructions: 'Help me inspect my GitHub repositories.',
        appLanguage: 'zh-CN',
        tools,
        skills,
        pluginGuides,
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
          configuration: {
            ...seed.configuration,
            instructions,
            initialInstructions: buildInitialSkillInstructions(skills),
            tools,
          },
        });
        const text = '你看看我的 github 的 skenora 项目';
        await submitAndWait(runtime, { ...input('first'), input: [{ type: 'text', text }] });
        const serialized = JSON.stringify(payload);
        expect(serialized).toContain(text);
        expect(serialized).toContain('# Cherry Studio Mobile Runtime');
        expect(serialized).toContain('<current-date>');
        expect(serialized).toContain('zh-CN');
        expect(serialized).toContain('Help me inspect my GitHub repositories.');
        expect(serialized).toContain('## Reading Attachments');
        expect(serialized).toContain('plugin:github: github workflows');
        expect(serialized).toContain('honor the requested branch');
        expect(serialized).not.toContain('Use get_me for account context.');
        expect(serialized).toContain('# Tool discovery');
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
          'read_file',
          'list_local_skills',
          'load_skill',
          'list_skill_files',
          'read_skill_file',
          'load_workflow',
          'tool_search',
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

  test('recovers a structured transient failure after a tool without repeating its action', async () => {
    const state = fixture();
    const execute = jest.fn(async () => ({ value: { saved: true }, artifacts: [] }));
    const tool: RuntimeTool = {
      ref: { source: 'builtin', capabilityId: 'write_file' },
      providerName: 'write_file',
      displayName: 'Write file',
      description: 'Save a file.',
      inputSchema: { type: 'object', properties: {} },
      approval: 'auto',
      execute,
    };
    state.ports.resolveTool = async () => tool;
    const resolveModel = state.dependencies.resolveModel;
    let requests = 0;
    state.dependencies.resolveModel = async (...args) => ({
      ...(await resolveModel(...args)),
      streamFn: () => {
        const stream = new AssistantMessageEventStream();
        requests += 1;
        if (requests === 2) {
          stream.push(
            providerErrorEvent(emptyAssistantMessage(wire), {
              message: '网络连接已中断',
              retryable: true,
            }),
          );
        } else {
          const reason = requests === 1 ? 'toolUse' : 'stop';
          stream.push({
            type: 'done',
            reason,
            message: {
              ...emptyAssistantMessage(wire),
              stopReason: reason,
              content:
                requests === 1
                  ? [{ type: 'toolCall', id: 'save', name: 'write_file', arguments: {} }]
                  : [{ type: 'text', text: 'Saved.' }],
            },
          });
        }
        stream.end();
        return stream;
      },
    });
    const runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    await runtime.ensureConversation({
      ...seed,
      configuration: { ...seed.configuration, tools: [tool] },
    });
    const terminal = deferred<string>();
    const observation = await runtime.observe('session', (event) => {
      if (event.type === 'turn.updated' && ['completed', 'failed'].includes(event.turn.status))
        terminal.resolve(event.turn.status);
    });
    try {
      await runtime.submit('session', input('recovery'));
      expect(await terminal.promise).toBe('completed');
      expect(requests).toBe(3);
      expect(execute).toHaveBeenCalledTimes(1);
      expect((await runtime.message('session', 'answer-recovery'))?.turn.error).toBeNull();
    } finally {
      await observation.unsubscribe();
      await runtime.close();
    }
  });

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

  test.each([false, true])(
    'rebuilds independent history with the system baseline first (compacted: %s)',
    async (compacted) => {
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
            contextCheckpoint: compacted
              ? {
                  version: 1,
                  anchorTurnId: 'earlier',
                  payload: {
                    kind: 'pi-context-compaction',
                    summary: 'Earlier user preferences.',
                    tokensBefore: 8000,
                  },
                }
              : null,
            referencedFileEntryIds: ['retained-file'],
          },
        });
        expect(state.requests).toHaveLength(1);
        expect(await runtime.resourceFileEntryIds('session')).toEqual(['retained-file']);
        await submitAndWait(runtime, input('next'));
        expect(state.requests[1]?.messages[0]?.role).toBe('system');
        expect(JSON.stringify(state.requests[1]?.messages[0])).toContain('Help.');
        expect(JSON.stringify(state.requests[1]?.messages[0])).toContain('<current-date>');
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
    },
  );

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

describe('Native web tools', () => {
  const webTool = (name: string): RuntimeTool => ({
    ref: { source: 'builtin', capabilityId: name },
    providerName: name,
    displayName: name,
    description: name,
    inputSchema: { type: 'object', properties: {} },
    approval: 'auto',
    ...(name.startsWith('web_') ? { failureGroup: 'web' } : {}),
    execute: jest.fn(async () => ({ value: null, artifacts: [] })),
  });
  const tools = [webTool('web_search'), webTool('web_fetch'), webTool('read_file')];
  const configuration = {
    ...seed.configuration,
    tools,
    webTools: {
      modelToolsPreferred: true,
      clientSearchAvailable: true,
      clientFetchAvailable: true,
    },
  };
  const sse = (events: readonly Record<string, unknown>[]) =>
    events
      .map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`)
      .join('');
  const item = (output_index: number, value: Record<string, unknown>) => [
    { type: 'response.output_item.added', output_index, item: value },
    { type: 'response.output_item.done', output_index, item: value },
  ];
  const completed = {
    type: 'response.completed',
    response: {
      id: 'response',
      status: 'completed',
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    },
  };
  const search = (status: string) => ({
    type: 'web_search_call',
    id: 'ws_1',
    status,
    action: { type: 'search', query: 'cherry' },
  });
  const answer = {
    type: 'message',
    id: 'msg_1',
    role: 'assistant',
    status: 'completed',
    content: [
      {
        type: 'output_text',
        text: 'Cherries are red [1]',
        annotations: [
          {
            type: 'url_citation',
            url: 'https://example.com/cherry',
            title: 'Cherry',
            start_index: 17,
            end_index: 20,
          },
        ],
      },
    ],
  };

  type Payload = Record<string, unknown> & {
    tools: Record<string, unknown>[];
    input: Record<string, unknown>[];
    messages: Record<string, unknown>[];
    contents: { role: string; parts: Record<string, unknown>[] }[];
    config: Record<string, unknown>;
  };

  /** An installed provider adapter over a scripted transport: real payloads, real parsing. */
  function nativeFixture(
    responses: readonly string[],
    native: PiNativeWebTools = {
      search: true,
      fetch: false,
      functionToolMixing: true,
      dialect: 'openai-responses',
    },
    api: Api = 'openai-responses',
    adapter: PiStreamFn = streamResponses as PiStreamFn,
  ) {
    const state = fixture();
    const payloads: Payload[] = [];
    const resolveModel = state.dependencies.resolveModel;
    const model = { ...wire, api, reasoning: true, baseUrl: 'https://provider.example.test/v1' };
    const fetch = async (_url: unknown, init?: { body?: unknown }) => {
      payloads.push(JSON.parse(String(init?.body)));
      return new Response(responses[payloads.length - 1], {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    };
    state.dependencies.nativeWebTools = async () => native;
    state.dependencies.resolveModel = async (...args) => ({
      ...(await resolveModel(...args)),
      model,
      nativeWebTools: native,
      streamFn: (wireModel, context, options) =>
        adapter(wireModel, context, {
          ...options,
          apiKey: 'test-key',
          maxRetries: 0,
          // The Google SDK owns its transport and reaches the scripted one through the global.
          ...(api === 'google-generative-ai' ? {} : { fetch }),
        }),
    });
    return { ...state, payloads, fetch };
  }
  const toolNames = (payload: Payload) => payload.tools.map((tool) => tool.name ?? tool.type);
  const anthropicResponse = (blocks: Record<string, unknown>[], reason = 'end_turn') =>
    sse([
      {
        type: 'message_start',
        message: { id: 'msg', model: 'wire-model', usage: { input_tokens: 10, output_tokens: 0 } },
      },
      ...blocks.flatMap((content_block, index) => [
        { type: 'content_block_start', index, content_block },
        { type: 'content_block_stop', index },
      ]),
      { type: 'message_delta', delta: { stop_reason: reason }, usage: { output_tokens: 5 } },
      { type: 'message_stop' },
    ]);
  const nativeAnthropic: PiNativeWebTools = {
    search: true,
    fetch: true,
    functionToolMixing: true,
    dialect: 'anthropic',
  };

  test('continues an Anthropic pause with intact content and tools, retaining text and usage', async () => {
    const paused = [
      { type: 'text', text: 'Searching. ' },
      {
        type: 'server_tool_use',
        id: 'srvtoolu_pause',
        name: 'web_search',
        input: { query: 'cherry' },
      },
    ];
    const state = nativeFixture(
      [
        anthropicResponse(paused, 'pause_turn'),
        anthropicResponse([
          {
            type: 'web_search_tool_result',
            tool_use_id: 'srvtoolu_pause',
            content: [
              {
                type: 'web_search_result',
                url: 'https://example.com/cherry',
                title: 'Cherry',
                encrypted_content: 'sealed',
              },
            ],
          },
          { type: 'text', text: 'Cherries are red.' },
        ]),
      ],
      nativeAnthropic,
      'anthropic-messages',
      streamAnthropic as PiStreamFn,
    );
    const runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    try {
      await runtime.ensureConversation({ ...seed, configuration });
      await submitAndWait(runtime, input('first'));
      expect(state.payloads).toHaveLength(2);
      expect(state.payloads[1]!.messages.at(-1)).toEqual({ role: 'assistant', content: paused });
      expect(state.payloads[1]!.tools).toEqual(state.payloads[0]!.tools);
      const result = (await runtime.message('session', 'answer-first'))!;
      expect(result.turn.status).toBe('completed');
      expect(result.turn.contextTokens).toBe(10);
      expect(result.turn.usage).toMatchObject({
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
      });
      expect(result.turn.parts.filter((part) => part.type === 'text')).toEqual([
        expect.objectContaining({ text: 'Searching. Cherries are red.' }),
      ]);
      expect(result.turn.parts).toContainEqual(
        expect.objectContaining({ type: 'source-url', url: 'https://example.com/cherry' }),
      );
      await runtime.drainUsage();
      expect(state.ports.recordUsage).toHaveBeenCalledTimes(2);
      expect(state.ports.recordUsage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          usage: expect.objectContaining({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
        }),
      );
    } finally {
      await runtime.close();
    }
  });

  test('resumes a server fetch deferred behind a client tool and preserves the document after reopen', async () => {
    const pending = [
      {
        type: 'server_tool_use',
        id: 'srvtoolu_fetch',
        name: 'web_fetch',
        input: { url: 'https://example.com/page' },
      },
      { type: 'tool_use', id: 'toolu_js', name: 'read_file', input: {} },
    ];
    const fetched = {
      type: 'web_fetch_tool_result',
      tool_use_id: 'srvtoolu_fetch',
      content: {
        type: 'web_fetch_result',
        url: 'https://example.com/page',
        content: {
          type: 'document',
          title: 'Page',
          source: { type: 'text', media_type: 'text/plain', data: 'Full document body' },
        },
      },
    };
    const state = nativeFixture(
      [
        anthropicResponse(pending, 'tool_use'),
        anthropicResponse([fetched, { type: 'text', text: 'Read the page.' }]),
        anthropicResponse([{ type: 'text', text: 'Follow-up.' }]),
      ],
      nativeAnthropic,
      'anthropic-messages',
      streamAnthropic as PiStreamFn,
    );
    state.ports.resolveTool = jest.fn(async () => tools[2]!);
    let runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    try {
      await runtime.ensureConversation({ ...seed, configuration });
      await submitAndWait(runtime, input('first'));
      expect(state.payloads).toHaveLength(2);
      expect(state.payloads[1]!.messages.find((entry) => entry.role === 'assistant')).toMatchObject(
        { content: pending },
      );
      expect(state.payloads[1]!.messages.at(-1)).toMatchObject({
        role: 'user',
        content: [expect.objectContaining({ type: 'tool_result', tool_use_id: 'toolu_js' })],
      });
      expect((await runtime.message('session', 'answer-first'))!.turn.status).toBe('completed');
      await runtime.close();
      runtime = state.create();
      await runtime.initialize(state.database, state.ports);
      await runtime.configure('session', configuration);
      await submitAndWait(runtime, input('second'));
      const history = state.payloads[2]!.messages;
      expect(
        history.some(
          (entry) =>
            Array.isArray(entry.content) &&
            entry.content.some(
              (block) => (block as { type?: string }).type === 'web_fetch_tool_result',
            ),
        ),
      ).toBe(true);
      expect(JSON.stringify(history)).toContain('Full document body');
      expect(tools[2]!.execute).toHaveBeenCalledTimes(1);
    } finally {
      await runtime.close();
    }
  });

  test('fails a repeatedly paused search at the continuation limit without discarding its prefix', async () => {
    const paused = anthropicResponse([{ type: 'text', text: 'Searching. ' }], 'pause_turn');
    const state = nativeFixture(
      Array(6).fill(paused),
      nativeAnthropic,
      'anthropic-messages',
      streamAnthropic as PiStreamFn,
    );
    const runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    try {
      await runtime.ensureConversation({ ...seed, configuration });
      await submitAndWait(runtime, input('first'), 'failed');
      expect(state.payloads).toHaveLength(6);
      const result = (await runtime.message('session', 'answer-first'))!;
      expect(result.turn.status).toBe('failed');
      expect(result.turn.parts.filter((part) => part.type === 'text')).toEqual([
        expect.objectContaining({ text: 'Searching. '.repeat(6) }),
      ]);
    } finally {
      await runtime.close();
    }
  });

  test('routes search to the provider and keeps its sources and replay state across reopen', async () => {
    const state = nativeFixture([
      sse([
        ...item(0, { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'sealed' }),
        ...item(1, search('completed')),
        ...item(2, answer),
        completed,
      ]),
      sse([...item(0, { ...answer, id: 'msg_2' }), completed]),
    ]);
    let runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    try {
      await runtime.ensureConversation({ ...seed, configuration });
      await submitAndWait(runtime, input('first'));
      // The external search function and the native tool never reach the model together.
      expect(toolNames(state.payloads[0]!)).toEqual(['web_fetch', 'read_file', 'web_search']);
      await runtime.close();
      runtime = state.create();
      await runtime.initialize(state.database, state.ports);
      const parts = (await runtime.message('session', 'answer-first'))!.turn.parts;
      const source = parts.find((part) => part.type === 'source-url');
      expect(source).toMatchObject({ url: 'https://example.com/cherry', title: 'Cherry' });
      // The appended source facts are model context, never a second visible answer.
      expect(parts.filter((part) => part.type === 'text')).toEqual([
        expect.objectContaining({
          text: `Cherries are red [cite:${source?.type === 'source-url' ? source.sourceId : ''}]`,
        }),
      ]);

      await runtime.configure('session', configuration);
      await submitAndWait(runtime, input('second'));
      const replayed = state.payloads[1]!.input;
      const reasoning = replayed.findIndex((entry) => entry.id === 'rs_1');
      expect(replayed[reasoning + 1]).toEqual(search('completed'));
      expect(JSON.stringify(replayed)).toContain('Web sources from this response');
    } finally {
      await runtime.close();
    }
  });

  test('a failed native lookup stops both web routes for the rest of the turn', async () => {
    const state = nativeFixture([
      sse([
        ...item(0, search('failed')),
        ...item(1, {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_1',
          name: 'web_fetch',
          arguments: '{}',
        }),
        completed,
      ]),
      sse([...item(0, answer), completed]),
    ]);
    state.ports.resolveTool = jest.fn(async (_identity, ref) =>
      tools.find(
        (tool) =>
          tool.ref.source === 'builtin' &&
          ref.source === 'builtin' &&
          tool.ref.capabilityId === ref.capabilityId,
      )!,
    );
    const runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    try {
      await runtime.ensureConversation({ ...seed, configuration });
      await submitAndWait(runtime, input('first'));
      expect(state.payloads).toHaveLength(2);
      expect(toolNames(state.payloads[1]!)).toEqual(['web_fetch', 'read_file']);
      expect(tools[1]!.execute).not.toHaveBeenCalled();
      const parts = (await runtime.message('session', 'answer-first'))!.turn.parts;
      expect(parts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'error',
            error: expect.objectContaining({ code: 'web_lookup_failed' }),
          }),
          expect.objectContaining({ type: 'tool', providerName: 'web_fetch', state: 'denied' }),
        ]),
      );
    } finally {
      await runtime.close();
    }
  });

  test('keeps the external tools when the Host supplies no web policy', async () => {
    const state = nativeFixture([sse([...item(0, answer), completed])]);
    const runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    try {
      await runtime.ensureConversation({
        ...seed,
        configuration: { ...configuration, webTools: undefined },
      });
      await submitAndWait(runtime, input('first'));
      expect(toolNames(state.payloads[0]!)).toEqual(['web_search', 'web_fetch', 'read_file']);
    } finally {
      await runtime.close();
    }
  });
  test('Anthropic server search shows one cited answer and replays its complete blocks', async () => {
    const block = (index: number, content_block: Record<string, unknown>, text?: string) => [
      { type: 'content_block_start', index, content_block },
      ...(text
        ? [{ type: 'content_block_delta', index, delta: { type: 'text_delta', text } }]
        : []),
    ];
    const stop = (index: number) => ({ type: 'content_block_stop', index });
    const anthropicAnswer = sse([
      {
        type: 'message_start',
        message: {
          id: 'msg_1',
          model: 'wire-model',
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      },
      ...block(0, { type: 'text', text: '' }, 'Searching. '),
      stop(0),
      ...block(1, { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: {} }),
      stop(1),
      ...block(2, {
        type: 'web_search_tool_result',
        tool_use_id: 'srvtoolu_1',
        content: [
          {
            type: 'web_search_result',
            url: 'https://example.com/cherry',
            title: 'Cherry',
            encrypted_content: 'sealed',
          },
        ],
      }),
      stop(2),
      ...block(3, { type: 'text', text: '' }, 'Cherries are red'),
      {
        type: 'content_block_delta',
        index: 3,
        delta: {
          type: 'citations_delta',
          citation: {
            type: 'web_search_result_location',
            url: 'https://example.com/cherry',
            title: 'Cherry',
            encrypted_index: 'sealed',
            cited_text: 'red',
          },
        },
      },
      stop(3),
      ...block(4, { type: 'text', text: '' }, '.'),
      stop(4),
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
      { type: 'message_stop' },
    ]);
    const state = nativeFixture(
      [anthropicAnswer, anthropicAnswer],
      { search: true, fetch: true, functionToolMixing: true, dialect: 'anthropic' },
      'anthropic-messages',
      streamAnthropic as PiStreamFn,
    );
    const runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    try {
      await runtime.ensureConversation({ ...seed, configuration });
      await submitAndWait(runtime, input('first'));
      expect(toolNames(state.payloads[0]!)).toEqual(['read_file', 'web_search', 'web_fetch']);
      expect(state.payloads[0]!.tools.slice(1).map((tool) => tool.type)).toEqual([
        'web_search_20250305',
        'web_fetch_20250910',
      ]);
      const parts = (await runtime.message('session', 'answer-first'))!.turn.parts;
      const source = parts.find((part) => part.type === 'source-url');
      const sourceId = source?.type === 'source-url' ? source.sourceId : '';
      expect(parts.filter((part) => part.type === 'text')).toEqual([
        expect.objectContaining({ text: `Searching. Cherries are red[cite:${sourceId}].` }),
      ]);

      await runtime.configure('session', configuration);
      await submitAndWait(runtime, input('second'));
      const history = JSON.stringify(state.payloads[1]!.messages);
      expect(history).not.toContain('Web sources from this response');
      expect(history).toContain('server_tool_use');
      expect(history).toContain('web_search_tool_result');
      expect(history).toContain('encrypted_content');
    } finally {
      await runtime.close();
    }
  });

  test('Gemini 3 searches beside functions and gets its server tool parts back', async () => {
    const call = {
      toolCall: { toolType: 'GOOGLE_SEARCH_WEB', args: { queries: ['q'] }, id: 'a1' },
    };
    const result = { toolResponse: { toolType: 'GOOGLE_SEARCH_WEB', response: {}, id: 'a1' } };
    const chunk = {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              { ...call, thoughtSignature: 'c2lnLTE=' },
              { ...result, thoughtSignature: 'c2lnLTI=' },
              { text: 'Cherries are red.', thoughtSignature: 'c2lnLTM=' },
            ],
          },
          finishReason: 'STOP',
          groundingMetadata: {
            groundingChunks: [{ web: { uri: 'https://example.com/cherry', title: 'Cherry' } }],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    };
    const body = `data: ${JSON.stringify(chunk)}\r\n\r\n`;
    const state = nativeFixture(
      [body, body],
      { search: true, fetch: false, functionToolMixing: true, dialect: 'google' },
      'google-generative-ai',
      streamGoogle as PiStreamFn,
    );
    const globalFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(state.fetch as never);
    const runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    try {
      await runtime.ensureConversation({ ...seed, configuration });
      await submitAndWait(runtime, input('first'));
      const request = state.payloads[0] as unknown as {
        tools: Record<string, unknown>[];
        toolConfig: Record<string, unknown>;
      };
      expect(request.tools.at(-1)).toEqual({ googleSearch: {} });
      expect(request.toolConfig.includeServerSideToolInvocations).toBe(true);
      expect(
        (await runtime.message('session', 'answer-first'))!.turn.parts.map((part) => part.type),
      ).toEqual(['text', 'source-url']);

      await runtime.configure('session', configuration);
      await submitAndWait(runtime, input('second'));
      const model = state.payloads[1]!.contents.find((content) => content.role === 'model')!;
      expect(model.parts.slice(0, 3)).toEqual([
        { ...call, thoughtSignature: 'c2lnLTE=' },
        { ...result, thoughtSignature: 'c2lnLTI=' },
        expect.objectContaining({ text: 'Cherries are red.' }),
      ]);
    } finally {
      await runtime.close();
      globalFetch.mockRestore();
    }
  });

  test.each([
    { kind: 'text', thought: false },
    { kind: 'thinking', thought: true },
  ])('keeps signed Gemini $kind around native tools after reopen', async ({ thought }) => {
    const signed = (text: string, thoughtSignature?: string) => ({
      text,
      ...(thought ? { thought: true } : {}),
      ...(thoughtSignature ? { thoughtSignature } : {}),
    });
    const call = (id: string) => ({
      toolCall: { toolType: 'GOOGLE_SEARCH_WEB', args: { queries: ['q'] }, id },
      thoughtSignature: 'Y2FsbA==',
    });
    const result = (id: string) => ({
      toolResponse: { toolType: 'GOOGLE_SEARCH_WEB', response: {}, id },
      thoughtSignature: 'cmVzdWx0',
    });
    const chunk = (parts: Record<string, unknown>[], finishReason?: string) => ({
      candidates: [
        { content: { role: 'model', parts }, ...(finishReason ? { finishReason } : {}) },
      ],
    });
    const body = [
      chunk([signed('Before ', 'YmVmb3Jl')]),
      chunk([signed('🍒')]),
      chunk([call('a1'), result('a1'), signed('After', 'YWZ0ZXI=')]),
      chunk([call('a2'), result('a2'), signed('Last', 'bGFzdA==')], 'STOP'),
    ]
      .map((value) => `data: ${JSON.stringify(value)}\r\n\r\n`)
      .join('');
    const state = nativeFixture(
      [body, body],
      { search: true, fetch: false, functionToolMixing: true, dialect: 'google' },
      'google-generative-ai',
      streamGoogle as PiStreamFn,
    );
    const globalFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(state.fetch as never);
    let runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    try {
      await runtime.ensureConversation({ ...seed, configuration });
      await submitAndWait(runtime, input('first'));
      await runtime.close();
      runtime = state.create();
      await runtime.initialize(state.database, state.ports);
      await runtime.configure('session', configuration);
      await submitAndWait(runtime, input('second'));
      const history = state.payloads[1]!.contents.find((content) => content.role === 'model')!;
      expect(history.parts.slice(0, 7)).toEqual([
        signed('Before 🍒', 'YmVmb3Jl'),
        call('a1'),
        result('a1'),
        signed('After', 'YWZ0ZXI='),
        call('a2'),
        result('a2'),
        signed('Last', 'bGFzdA=='),
      ]);
    } finally {
      await runtime.close();
      globalFetch.mockRestore();
    }
  });

  test('a Chat Completions host searches through its own switch and reports sources', async () => {
    const chunk = (delta: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
      `data: ${JSON.stringify({
        id: 'chat',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta, finish_reason: null }],
        ...extra,
      })}\n\n`;
    const state = nativeFixture(
      [
        chunk({ role: 'assistant', content: 'Cherries are red.' }) +
          `data: ${JSON.stringify({
            id: 'chat',
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            web_search: [{ title: 'Cherry', link: 'https://example.com/cherry', refer: 'ref_1' }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          })}\n\ndata: [DONE]\n\n`,
      ],
      { search: true, fetch: false, functionToolMixing: true, dialect: 'zhipu' },
      'openai-completions',
      streamCompletions as PiStreamFn,
    );
    const runtime = state.create();
    await runtime.initialize(state.database, state.ports);
    try {
      await runtime.ensureConversation({ ...seed, configuration });
      await submitAndWait(runtime, input('first'));
      expect(state.payloads[0]!.tools.at(-1)).toEqual({
        type: 'web_search',
        web_search: { enable: true, search_engine: 'search_pro', search_result: true },
      });
      expect(
        state.payloads[0]!.tools.map((tool) => (tool.function as { name?: string })?.name),
      ).not.toContain('web_search');
      expect((await runtime.message('session', 'answer-first'))!.turn.parts).toEqual([
        expect.objectContaining({ type: 'text', text: 'Cherries are red.' }),
        expect.objectContaining({ type: 'source-url', url: 'https://example.com/cherry' }),
      ]);
    } finally {
      await runtime.close();
    }
  });
});
