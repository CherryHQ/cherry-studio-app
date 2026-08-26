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
    apiKey: 'test-key',
    defaultThinkingLevel: 'medium',
    maxRetries: 0,
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
    supportsTools: true,
    timeoutMs: 60_000,
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
  const runtime = new PiRuntime({ resolveModel: () => holder.resolution }, factory);
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
    input: [{ type: 'text', text: 'Hello.' }],
    options: {},
    tools: [],
    ...overrides,
  };
}

function askTool(onExecute: () => void): RuntimeTool {
  return {
    approval: 'ask',
    description: 'Delete a file.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
    name: 'delete_file',
    async execute() {
      onExecute();
      return { deleted: true };
    },
  };
}

function approvalProgram(toolCallId: string): TestAgentProgram {
  return async (context) => {
    const tool = context.options.initialState?.tools?.[0];
    if (!tool) throw new Error('Approval program requires one tool.');
    const partial = assistantMessage({
      content: [
        { type: 'toolCall', id: toolCallId, name: tool.name, arguments: { path: '/tmp/a' } },
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
    const result = await tool.execute(toolCallId, { path: '/tmp/a' }, context.signal);
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
      toolName: tool.name,
    };
  },

  arrangeCancellable(runtime, turnId): ArrangedRequest {
    arrange(runtime, async (context) => {
      const partial = assistantMessage({ content: [{ type: 'text', text: 'Working' }] });
      await context.emit({ type: 'message_start', message: partial });
      await context.emit({
        type: 'message_update',
        message: partial,
        assistantMessageEvent: { type: 'text_start', contentIndex: 0, partial },
      });
      await new Promise<void>((resolve) => {
        context.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });
    return { request: baseRequest(turnId) };
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
              toolName: 'lookup',
              input: { query: 'Cherry Studio' },
            },
            {
              type: 'tool-result',
              toolCallId: 'historic-call',
              output: { found: true },
              isError: false,
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
              name: 'lookup',
              arguments: { query: 'Cherry Studio' },
            },
          ],
        },
        {
          role: 'toolResult',
          toolCallId: 'historic-call',
          toolName: 'lookup',
          details: { found: true },
        },
      ],
      systemPrompt: 'Be helpful.\n\nPrior system note.',
      thinkingLevel: 'high',
    });
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
});
