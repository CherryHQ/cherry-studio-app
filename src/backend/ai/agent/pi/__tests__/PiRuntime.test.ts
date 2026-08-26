import path from 'node:path';

import type { AgentEvent as PiAgentEvent } from '@earendil-works/pi-agent-core';
import type { AgentOptions } from '@earendil-works/pi-agent-core/agent';
import type {
  AssistantMessage,
  Message as PiMessage,
  ToolResultMessage,
  Usage as PiUsage,
} from '@earendil-works/pi-ai';

import {
  type ArrangedApprovalRequest,
  type ArrangedErrorRequest,
  type ArrangedRequest,
  describeRuntimeConformance,
  type RuntimeConformanceHarness,
} from '../../__tests__/_runtimeConformance';
import type { AgentRuntime, RuntimeEvent, RuntimeExecutionRequest, RuntimeTool } from '../../types';
import {
  PiRuntime,
  type PiModelResolution,
  type PiRuntimeAgent,
  type PiRuntimeAgentFactory,
} from '../PiRuntime';

const ERROR_SECRET = 'test-key';
const TOOL_REF = { source: 'mcp', serverId: 'server-1', rawToolName: 'delete_file' } as const;
const TOOL_PROVIDER_NAME = 'mcp_server_1_delete_file_a1b2';
const TOOL_DISPLAY_NAME = 'Delete file';

type TestAgentContext = {
  emit(event: PiAgentEvent): Promise<void>;
  options: AgentOptions;
  prompt: PiMessage;
  signal: AbortSignal;
};

type TestAgentProgram = (context: TestAgentContext) => Promise<void> | void;

class TestPiAgent implements PiRuntimeAgent {
  private activeRun = Promise.resolve();
  private readonly controller = new AbortController();
  private readonly listeners = new Set<Parameters<PiRuntimeAgent['subscribe']>[0]>();

  constructor(
    private readonly options: AgentOptions,
    private readonly program: TestAgentProgram,
  ) {}

  abort(): void {
    this.controller.abort();
  }

  async prompt(message: PiMessage | PiMessage[]): Promise<void> {
    const prompt = Array.isArray(message) ? message.at(-1) : message;
    if (!prompt) throw new Error('Test Pi Agent requires a prompt.');
    this.activeRun = Promise.resolve(
      this.program({
        emit: async (event) => {
          for (const listener of this.listeners) await listener(event, this.controller.signal);
        },
        options: this.options,
        prompt,
        signal: this.controller.signal,
      }),
    );
    await this.activeRun;
  }

  subscribe(listener: Parameters<PiRuntimeAgent['subscribe']>[0]): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  waitForIdle(): Promise<void> {
    return this.activeRun;
  }
}

type RuntimeHolder = {
  lastOptions?: AgentOptions;
  program?: TestAgentProgram;
  resolution: PiModelResolution;
};

const holders = new WeakMap<AgentRuntime, RuntimeHolder>();

function createResolution(): PiModelResolution {
  return {
    defaultThinkingLevel: 'medium',
    model: {
      api: 'openai-responses',
      baseUrl: 'https://provider.example/v1',
      contextWindow: 128_000,
      cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
      id: 'mock-model',
      input: ['text'],
      maxTokens: 4096,
      name: 'Mock Model',
      provider: 'mock-provider',
      reasoning: true,
    },
    redactionValues: [ERROR_SECRET],
    streamFn: () => {
      throw new Error('The fake Pi agent must not call the provider stream.');
    },
    supportsTools: true,
    usageContext: {
      credentialReceipt: {
        attribution: 'explicit',
        id: 'credential-1',
        masked: 'sk-…test',
      },
      modelId: 'mock-model',
      modelName: 'Mock Model',
      pricingSnapshot: null,
      providerId: 'mock-provider',
      providerName: 'Mock Provider',
      reportedCostCurrency: null,
      trustProviderReportedCost: false,
    },
  };
}

function createTestRuntime(): PiRuntime {
  const holder: RuntimeHolder = { resolution: createResolution() };
  const factory: PiRuntimeAgentFactory = (options) => {
    holder.lastOptions = options;
    if (!holder.program) throw new Error('Test Pi Agent program was not configured.');
    return new TestPiAgent(options, holder.program);
  };
  const runtime = new PiRuntime(
    {
      preflightModel: () => ({
        contextWindow: holder.resolution.model.contextWindow,
        inputModalities: [...holder.resolution.model.input],
        maxInputTokens: holder.resolution.model.contextWindow - holder.resolution.model.maxTokens,
        maxOutputTokens: holder.resolution.model.maxTokens,
        supportsTools: holder.resolution.supportsTools,
      }),
      resolveModel: () => holder.resolution,
    },
    factory,
  );
  holders.set(runtime, holder);
  return runtime;
}

function arrange(runtime: AgentRuntime, program: TestAgentProgram): RuntimeHolder {
  const holder = holders.get(runtime);
  if (!holder) throw new Error('Runtime was not created by createTestRuntime.');
  holder.program = program;
  return holder;
}

function usage(
  input: number,
  output: number,
  details: { cacheRead?: number; cacheWrite?: number; reasoning?: number } = {},
): PiUsage {
  const cacheRead = details.cacheRead ?? 0;
  const cacheWrite = details.cacheWrite ?? 0;
  return {
    cacheRead,
    cacheWrite,
    cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
    input,
    output,
    ...(details.reasoning !== undefined ? { reasoning: details.reasoning } : {}),
    totalTokens: input + cacheRead + cacheWrite + output,
  };
}

function assistantMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    api: 'openai-responses',
    content: [{ type: 'text', text: 'Done.' }],
    model: 'mock-model',
    provider: 'mock-provider',
    role: 'assistant',
    stopReason: 'stop',
    timestamp: Date.now(),
    usage: usage(3, 2),
    ...overrides,
  };
}

async function emitText(context: TestAgentContext, text: string): Promise<void> {
  const starting = assistantMessage({ content: [{ type: 'text', text: '' }] });
  const final = assistantMessage({ content: [{ type: 'text', text }] });
  await context.emit({ type: 'message_start', message: starting });
  await context.emit({
    type: 'message_update',
    message: starting,
    assistantMessageEvent: { type: 'text_start', contentIndex: 0, partial: starting },
  });
  await context.emit({
    type: 'message_update',
    message: final,
    assistantMessageEvent: {
      type: 'text_delta',
      contentIndex: 0,
      delta: text,
      partial: final,
    },
  });
  await context.emit({
    type: 'message_update',
    message: final,
    assistantMessageEvent: { type: 'text_end', contentIndex: 0, content: text, partial: final },
  });
  await context.emit({ type: 'message_end', message: final });
  await context.emit({ type: 'turn_end', message: final, toolResults: [] });
}

function baseRequest(
  turnId: string,
  overrides: Partial<RuntimeExecutionRequest> = {},
): RuntimeExecutionRequest {
  return {
    turnId,
    instructions: 'Be helpful.',
    model: { providerId: 'mock-provider', modelId: 'mock-model' },
    history: [],
    contextCheckpoint: null,
    input: [{ type: 'text', text: 'Hello.' }],
    options: {},
    tools: [],
    ...overrides,
  };
}

function askTool(onExecute: () => void): RuntimeTool {
  return {
    ref: TOOL_REF,
    providerName: TOOL_PROVIDER_NAME,
    displayName: TOOL_DISPLAY_NAME,
    approval: 'ask',
    description: 'Delete a file.',
    inputSchema: {
      type: 'object',
      properties: { fileEntryId: { type: 'string' } },
      required: ['fileEntryId'],
    },
    async execute() {
      onExecute();
      return { value: { deleted: true }, artifacts: [] };
    },
  };
}

function approvalProgram(toolCallId: string): TestAgentProgram {
  return async (context) => {
    const tool = context.options.initialState?.tools?.[0];
    if (!tool) throw new Error('Approval program requires one tool.');
    const partial = assistantMessage({
      content: [
        { type: 'toolCall', id: toolCallId, name: tool.name, arguments: { fileEntryId: 'file-1' } },
      ],
      stopReason: 'toolUse',
    });
    await context.emit({ type: 'message_start', message: partial });
    await context.emit({
      type: 'message_update',
      message: partial,
      assistantMessageEvent: {
        type: 'toolcall_end',
        contentIndex: 0,
        toolCall: partial.content[0] as Extract<
          AssistantMessage['content'][number],
          { type: 'toolCall' }
        >,
        partial,
      },
    });
    await context.emit({ type: 'message_end', message: partial });
    let result: Awaited<ReturnType<typeof tool.execute>>;
    try {
      result = await tool.execute(toolCallId, { fileEntryId: 'file-1' }, context.signal);
    } catch {
      const failedToolResult: ToolResultMessage = {
        role: 'toolResult',
        toolCallId,
        toolName: tool.name,
        content: [{ type: 'text', text: 'Native cancellation failure.' }],
        details: { message: 'Native cancellation failure.' },
        isError: true,
        timestamp: Date.now(),
      };
      await context.emit({ type: 'turn_end', message: partial, toolResults: [failedToolResult] });
      return;
    }
    if (context.signal.aborted) return;
    const toolResult: ToolResultMessage = {
      role: 'toolResult',
      toolCallId,
      toolName: tool.name,
      content: result.content,
      details: result.details,
      isError: false,
      timestamp: Date.now(),
    };
    await context.emit({ type: 'turn_end', message: partial, toolResults: [toolResult] });
    await emitText(context, 'Tool handled.');
  };
}

const harness: RuntimeConformanceHarness = {
  createRuntime: createTestRuntime,

  arrangeSuccess(runtime, turnId): ArrangedRequest {
    arrange(runtime, (context) => emitText(context, 'Hello from Pi.'));
    return { request: baseRequest(turnId) };
  },

  arrangeUnsupported(_runtime, turnId): ArrangedRequest {
    return {
      request: baseRequest(turnId, {
        input: [{ type: 'file', mediaType: 'image/png', uri: 'file:///image.png' }],
      }),
    };
  },

  arrangeApproval(runtime, turnId): ArrangedApprovalRequest {
    const toolCallId = 'call-1';
    let executed = false;
    const tool = askTool(() => {
      executed = true;
    });
    arrange(runtime, approvalProgram(toolCallId));
    return {
      request: baseRequest(turnId, { tools: [tool] }),
      toolCallId,
      toolExecuted: () => executed,
      toolRef: tool.ref,
      displayName: tool.displayName,
    };
  },

  arrangeCancellable(runtime, turnId): ArrangedRequest {
    const tool = askTool(() => undefined);
    arrange(runtime, approvalProgram('call-cancel'));
    return { request: baseRequest(turnId, { tools: [tool] }) };
  },

  arrangeError(runtime, turnId): ArrangedErrorRequest {
    arrange(runtime, async (context) => {
      const failed = assistantMessage({
        errorMessage: `Provider rejected ${ERROR_SECRET}`,
        stopReason: 'error',
      });
      await context.emit({ type: 'turn_end', message: failed, toolResults: [] });
    });
    return { request: baseRequest(turnId), secret: ERROR_SECRET };
  },

  sourceFiles: [
    path.resolve(__dirname, '../../types.ts'),
    path.resolve(__dirname, '../../RuntimeEventChannel.ts'),
    path.resolve(__dirname, '../../toolResults.ts'),
    path.resolve(__dirname, '../PiRuntime.ts'),
    path.resolve(__dirname, '../modelMessages.ts'),
  ],
};

describe('PiRuntime conformance', () => {
  describeRuntimeConformance(harness);
});

async function collect(stream: AsyncIterable<RuntimeEvent>): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe('PiRuntime mapping', () => {
  test('preflights and maps current and historical inline images without retaining data URLs', async () => {
    const runtime = createTestRuntime();
    const holder = holders.get(runtime);
    if (!holder) throw new Error('missing Runtime holder');
    holder.resolution = {
      ...holder.resolution,
      model: { ...holder.resolution.model, input: ['text', 'image'] },
    };
    let prompt: PiMessage | undefined;
    const arranged = arrange(runtime, async (context) => {
      prompt = context.prompt;
      await emitText(context, 'I see both images.');
    });
    const session = await runtime.open();
    const image = {
      type: 'file' as const,
      mediaType: 'image/png',
      name: 'image.png',
      uri: 'data:image/png;base64,AAAA',
    };

    expect(await runtime.preflightModel(baseRequest('preflight').model)).toMatchObject({
      inputModalities: ['text', 'image'],
    });
    await collect(
      session.execute(
        baseRequest('turn-images', {
          history: [{ turnId: 'turn-before-images', messages: [{ role: 'user', parts: [image] }] }],
          input: [{ type: 'text', text: 'Compare these.' }, image],
        }),
      ),
    );

    expect(arranged.lastOptions?.initialState?.model.input).toEqual(['text', 'image']);
    expect(arranged.lastOptions?.initialState?.messages).toEqual([
      {
        role: 'user',
        content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }],
        timestamp: expect.any(Number),
      },
    ]);
    expect(prompt).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'Compare these.' },
        { type: 'image', data: 'AAAA', mimeType: 'image/png' },
      ],
      timestamp: expect.any(Number),
    });
    await session.close();
  });

  test('surfaces provider errors after redacting resolved credentials', async () => {
    const runtime = createTestRuntime();
    arrange(runtime, async (context) => {
      const failed = assistantMessage({
        errorMessage: `OpenAI API error (403): access denied for ${ERROR_SECRET}`,
        stopReason: 'error',
      });
      await context.emit({ type: 'turn_end', message: failed, toolResults: [] });
    });
    const session = await runtime.open();

    const events = await collect(session.execute(baseRequest('turn-provider-error')));

    expect(events.at(-1)).toEqual({
      type: 'failed',
      error: {
        code: 'runtime_error',
        message: 'OpenAI API error (403): access denied for [REDACTED]',
        retryable: false,
      },
    });
    await session.close();
  });

  test('surfaces thrown runtime errors without stack traces', async () => {
    const runtime = createTestRuntime();
    arrange(runtime, () => {
      throw new Error('Provider configuration is unsupported.');
    });
    const session = await runtime.open();

    const events = await collect(session.execute(baseRequest('turn-thrown-error')));

    expect(events.at(-1)).toEqual({
      type: 'failed',
      error: {
        code: 'runtime_error',
        message: 'Provider configuration is unsupported.',
        retryable: false,
      },
    });
    await session.close();
  });

  test('maps complete context, Agent options, stream parts, and usage', async () => {
    const runtime = createTestRuntime();
    const holder = arrange(runtime, async (context) => {
      await context.emit({
        type: 'turn_end',
        message: assistantMessage({
          content: [],
          stopReason: 'toolUse',
          usage: usage(2, 1, { cacheRead: 3, cacheWrite: 1, reasoning: 1 }),
        }),
        toolResults: [],
      });
      await emitText(context, 'Pi answer.');
    });
    const session = await runtime.open();
    const request = baseRequest('turn-context', {
      history: [
        {
          turnId: 'turn-history',
          messages: [
            { role: 'system', parts: [{ type: 'text', text: 'Prior system note.' }] },
            { role: 'user', parts: [{ type: 'text', text: 'Earlier question.' }] },
            { role: 'assistant', parts: [{ type: 'reasoning', text: 'Earlier thought.' }] },
            { role: 'assistant', parts: [{ type: 'text', text: 'Earlier answer.' }] },
            {
              role: 'assistant',
              parts: [
                {
                  type: 'tool-call',
                  toolCallId: 'historic-call',
                  toolRef: { source: 'mcp', serverId: 'server-2', rawToolName: 'lookup' },
                  providerName: 'mcp_server_2_lookup_c3d4',
                  input: { query: 'Cherry Studio' },
                },
                {
                  type: 'tool-result',
                  toolCallId: 'historic-call',
                  output: { value: { found: true }, artifacts: [] },
                  isError: false,
                },
              ],
            },
          ],
        },
      ],
      options: { maxOutputTokens: 512, reasoningEffort: 'high', temperature: 0.3 },
    });

    const events = await collect(session.execute(request));

    expect(events.map((event) => event.type)).toEqual([
      'part.add',
      'text.delta',
      'part.replace',
      'usage',
      'completed',
    ]);
    expect(events.at(-2)).toEqual({
      type: 'usage',
      completedAt: expect.any(Number),
      context: holder.resolution.usageContext,
      usage: {
        cacheReadTokens: 3,
        cacheWriteTokens: 1,
        inputTokens: 9,
        noCacheTokens: 5,
        outputTokens: 3,
        reasoningTokens: 1,
        totalTokens: 12,
      },
    });
    expect(holder.lastOptions?.initialState).toMatchObject({
      messages: [
        { role: 'user', content: 'Earlier question.' },
        { role: 'assistant', content: [{ type: 'thinking', thinking: 'Earlier thought.' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Earlier answer.' }] },
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'historic-call',
              name: 'mcp_server_2_lookup_c3d4',
              arguments: { query: 'Cherry Studio' },
            },
          ],
        },
        {
          role: 'toolResult',
          toolCallId: 'historic-call',
          toolName: 'mcp_server_2_lookup_c3d4',
          details: { value: { found: true }, artifacts: [] },
        },
      ],
      systemPrompt: 'Be helpful.\n\nPrior system note.',
      thinkingLevel: 'high',
    });
    expect(holder.lastOptions?.streamFn).toBe(holder.resolution.streamFn);
    expect(holder.lastOptions?.getApiKey).toBeUndefined();
    await session.close();
  });

  test('rejects tools for a model without native tool calling before starting Pi', async () => {
    const runtime = createTestRuntime();
    const holder = holders.get(runtime);
    if (!holder) throw new Error('missing Runtime holder');
    holder.resolution = { ...holder.resolution, supportsTools: false };
    holder.program = () => {
      throw new Error('Pi must not start.');
    };
    const session = await runtime.open();

    const events = await collect(
      session.execute(baseRequest('turn-no-tools', { tools: [askTool(() => undefined)] })),
    );

    expect(events).toEqual([
      {
        type: 'failed',
        error: {
          code: 'unsupported_tools',
          message: 'The selected model does not support native tool calling.',
          retryable: false,
        },
      },
    ]);
    expect(holder.lastOptions).toBeUndefined();
    await session.close();
  });

  test('maps stable tool identity, result envelopes, and managed artifacts', async () => {
    const runtime = createTestRuntime();
    const tool: RuntimeTool = {
      ref: { source: 'builtin', capabilityId: 'create-report' },
      providerName: 'builtin_create_report_a1b2',
      displayName: 'Create report',
      description: 'Create a managed report.',
      inputSchema: { type: 'object' },
      approval: 'auto',
      execute: async () => ({
        value: { created: true },
        artifacts: [
          {
            ref: { kind: 'managed-file', fileEntryId: 'file-1' },
            mediaType: 'text/markdown',
            name: 'report.md',
            kind: 'created',
          },
        ],
      }),
    };
    const holder = arrange(runtime, approvalProgram('artifact-call'));
    const session = await runtime.open();

    const events = await collect(session.execute(baseRequest('turn-artifact', { tools: [tool] })));

    expect(holder.lastOptions?.initialState?.tools?.[0]).toMatchObject({
      name: tool.providerName,
      label: tool.displayName,
    });
    expect(
      events.find(
        (event) =>
          event.type === 'part.replace' &&
          event.part.type === 'tool' &&
          event.part.state === 'output-available',
      ),
    ).toMatchObject({
      part: {
        toolRef: tool.ref,
        providerName: tool.providerName,
        displayName: tool.displayName,
        output: {
          value: { created: true },
          artifacts: [{ ref: { kind: 'managed-file', fileEntryId: 'file-1' } }],
        },
      },
    });
    expect(
      events.find((event) => event.type === 'part.add' && event.part.type === 'file'),
    ).toMatchObject({
      part: {
        ref: { kind: 'managed-file', fileEntryId: 'file-1' },
        purpose: 'artifact',
      },
    });
    await session.close();
  });

  test('normalizes callback failures into a classified result envelope', async () => {
    const runtime = createTestRuntime();
    const tool: RuntimeTool = {
      ref: TOOL_REF,
      providerName: TOOL_PROVIDER_NAME,
      displayName: TOOL_DISPLAY_NAME,
      description: 'Fail safely.',
      inputSchema: { type: 'object' },
      approval: 'auto',
      execute: async () => {
        throw new Error(`native failure containing ${ERROR_SECRET}`);
      },
    };
    arrange(runtime, approvalProgram('failed-call'));
    const session = await runtime.open();

    const events = await collect(
      session.execute(baseRequest('turn-tool-error', { tools: [tool] })),
    );
    const failedPart = events.find(
      (event) =>
        event.type === 'part.replace' && event.part.type === 'tool' && event.part.state === 'error',
    );

    expect(failedPart).toMatchObject({
      part: {
        error: {
          code: 'tool_execution_error',
          message: 'The tool failed to execute.',
          retryable: false,
        },
        output: {
          value: {
            status: 'error',
            error: { code: 'tool_execution_error', retryable: false },
          },
          artifacts: [],
        },
      },
    });
    expect(JSON.stringify(failedPart)).not.toContain(ERROR_SECRET);
    await session.close();
  });
});
