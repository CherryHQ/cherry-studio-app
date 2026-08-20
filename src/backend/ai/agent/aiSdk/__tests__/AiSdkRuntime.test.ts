import path from 'node:path';

import type { LanguageModelV3StreamPart, LanguageModelV3Usage } from '@ai-sdk/provider';
import { APICallError } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';

import {
  type ArrangedApprovalRequest,
  type ArrangedErrorRequest,
  type ArrangedRequest,
  describeRuntimeConformance,
  type RuntimeConformanceHarness,
} from '../../__tests__/_runtimeConformance';
import type { AgentRuntime, RuntimeEvent, RuntimeExecutionRequest, RuntimeTool } from '../../types';
import { AiSdkRuntime, type AiSdkModelResolution } from '../AiSdkRuntime';

const ERROR_SECRET = 'sk-live-super-secret-3aa41c';

function v3Usage(inputTokens: number, outputTokens: number): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: inputTokens,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: outputTokens, text: undefined, reasoning: undefined },
  };
}

function textStreamParts(text: string, usage = v3Usage(3, 2)): LanguageModelV3StreamPart[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't1' },
    ...[...text].map(
      (character): LanguageModelV3StreamPart => ({
        type: 'text-delta',
        id: 't1',
        delta: character,
      }),
    ),
    { type: 'text-end', id: 't1' },
    { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage },
  ];
}

function toolCallStreamParts(
  toolName: string,
  toolCallId: string,
  input: object,
  usage = v3Usage(4, 1),
): LanguageModelV3StreamPart[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'tool-call', toolCallId, toolName, input: JSON.stringify(input) },
    { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage },
  ];
}

function streamResult(parts: LanguageModelV3StreamPart[]) {
  return { stream: convertArrayToReadableStream(parts) };
}

/**
 * One stream result per doStream call, in order. MockLanguageModelV3's own
 * array form reads `doStream[doStreamCalls.length]` after pushing the call, so
 * its first response is `[1]`, never `[0]` — use the function form instead.
 */
function sequenceStreams(partLists: LanguageModelV3StreamPart[][]) {
  let call = 0;
  return async () => {
    const parts = partLists[Math.min(call++, partLists.length - 1)] ?? [];
    return streamResult(parts);
  };
}

function baseRequest(
  turnId: string,
  overrides: Partial<RuntimeExecutionRequest> = {},
): RuntimeExecutionRequest {
  return {
    turnId,
    instructions: 'You are a helpful assistant.',
    model: { providerId: 'mock-provider', modelId: 'mock-model' },
    history: [],
    input: [{ type: 'text', text: 'Hello.' }],
    tools: [],
    options: {},
    ...overrides,
  };
}

type ModelHolder = { resolution: AiSdkModelResolution | undefined };
const holders = new WeakMap<AgentRuntime, ModelHolder>();

function createTestRuntime(): AiSdkRuntime {
  const holder: ModelHolder = { resolution: undefined };
  const runtime = new AiSdkRuntime({
    resolveModel: () => {
      if (!holder.resolution) {
        throw new Error('Test model was not configured for this runtime.');
      }
      return holder.resolution;
    },
  });
  holders.set(runtime, holder);
  return runtime;
}

function setModel(runtime: AgentRuntime, model: MockLanguageModelV3): void {
  const holder = holders.get(runtime);
  if (!holder) {
    throw new Error('Runtime was not created by createTestRuntime.');
  }
  holder.resolution = { model };
}

function askTool(onExecute: () => void): RuntimeTool {
  return {
    name: 'delete_file',
    description: 'Delete a file.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
    approval: 'ask',
    async execute() {
      onExecute();
      return { deleted: true };
    },
  };
}

const harness: RuntimeConformanceHarness = {
  createRuntime() {
    return createTestRuntime();
  },

  arrangeSuccess(runtime, turnId): ArrangedRequest {
    setModel(runtime, new MockLanguageModelV3({ doStream: streamResult(textStreamParts('Hi')) }));
    return { request: baseRequest(turnId) };
  },

  arrangeUnsupported(runtime, turnId): ArrangedRequest {
    // attachments: false — file input must be rejected before model resolution.
    return {
      request: baseRequest(turnId, {
        input: [
          { type: 'file', mediaType: 'image/png', name: 'shot.png', uri: 'file:///shot.png' },
        ],
      }),
    };
  },

  arrangeApproval(runtime, turnId): ArrangedApprovalRequest {
    const toolCallId = 'call-1';
    let executed = false;
    const tool = askTool(() => {
      executed = true;
    });
    setModel(
      runtime,
      new MockLanguageModelV3({
        doStream: sequenceStreams([
          toolCallStreamParts(tool.name, toolCallId, { path: '/tmp/report.txt' }),
          textStreamParts('Done'),
        ]),
      }),
    );
    return {
      request: baseRequest(turnId, { tools: [tool] }),
      toolName: tool.name,
      toolCallId,
      toolExecuted: () => executed,
    };
  },

  arrangeCancellable(runtime, turnId): ArrangedRequest {
    setModel(
      runtime,
      new MockLanguageModelV3({
        doStream: async () => ({
          stream: new ReadableStream<LanguageModelV3StreamPart>({
            start(controller) {
              controller.enqueue({ type: 'stream-start', warnings: [] });
              controller.enqueue({ type: 'text-start', id: 't1' });
              controller.enqueue({ type: 'text-delta', id: 't1', delta: 'Working' });
              // Never closes: the turn stays active until cancelled.
            },
          }),
        }),
      }),
    );
    return { request: baseRequest(turnId) };
  },

  arrangeError(runtime, turnId): ArrangedErrorRequest {
    setModel(
      runtime,
      new MockLanguageModelV3({
        doStream: async () => {
          throw new APICallError({
            message: `Unauthorized: invalid api key ${ERROR_SECRET}`,
            url: 'https://provider.example/v1/chat',
            requestBodyValues: { apiKey: ERROR_SECRET },
            statusCode: 401,
            responseBody: `{"error":"bad key ${ERROR_SECRET}"}`,
            isRetryable: false,
          });
        },
      }),
    );
    return { request: baseRequest(turnId), secret: ERROR_SECRET };
  },

  sourceFiles: [
    path.resolve(__dirname, '../../types.ts'),
    path.resolve(__dirname, '../../RuntimeEventChannel.ts'),
    path.resolve(__dirname, '../AiSdkRuntime.ts'),
    path.resolve(__dirname, '../modelMessages.ts'),
  ],
};

describe('AiSdkRuntime conformance', () => {
  describeRuntimeConformance(harness);
});

async function collect(stream: AsyncIterable<RuntimeEvent>): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe('AiSdkRuntime mapping', () => {
  test('streams text through part.add, text.delta, and a done part.replace with stable ids', async () => {
    const runtime = createTestRuntime();
    setModel(runtime, new MockLanguageModelV3({ doStream: streamResult(textStreamParts('Hi')) }));
    const session = await runtime.open();

    const events = await collect(session.execute(baseRequest('turn-1')));

    expect(events.map((event) => event.type)).toEqual([
      'part.add',
      'text.delta',
      'text.delta',
      'part.replace',
      'usage',
      'usage',
      'completed',
    ]);
    const added = events[0];
    const replaced = events[3];
    if (added?.type !== 'part.add' || replaced?.type !== 'part.replace') {
      throw new Error('expected part events');
    }
    expect(added.part).toEqual({ id: 'text-t1', type: 'text', text: '', state: 'streaming' });
    expect(replaced.part).toEqual({ id: 'text-t1', type: 'text', text: 'Hi', state: 'done' });
    await session.close();
  });

  test('walks an approved ask tool through its full part state machine', async () => {
    const runtime = createTestRuntime();
    let executed = false;
    const tool = askTool(() => {
      executed = true;
    });
    setModel(
      runtime,
      new MockLanguageModelV3({
        doStream: sequenceStreams([
          toolCallStreamParts(tool.name, 'call-1', { path: '/tmp/report.txt' }),
          textStreamParts('Done'),
        ]),
      }),
    );
    const session = await runtime.open();
    const request = baseRequest('turn-1', { tools: [tool] });

    const iterator = session.execute(request)[Symbol.asyncIterator]();
    const events: RuntimeEvent[] = [];
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      events.push(next.value);
      if (next.value.type === 'approval.requested') {
        await session.respondApproval({
          turnId: 'turn-1',
          approvalId: next.value.approval.id,
          decision: 'approve',
        });
      }
    }

    const toolStates = events
      .filter((event) => event.type === 'part.add' || event.type === 'part.replace')
      .map((event) => (event.type === 'part.add' ? event.part : event.part))
      .filter((part) => part.type === 'tool')
      .map((part) => (part.type === 'tool' ? part.state : ''));
    expect(toolStates).toEqual([
      'input-available',
      'awaiting-approval',
      'running',
      'output-available',
    ]);
    expect(executed).toBe(true);

    const approvals = events.filter(
      (event) => event.type === 'approval.requested' || event.type === 'approval.resolved',
    );
    expect(
      approvals.map((event) =>
        event.type === 'approval.requested' || event.type === 'approval.resolved'
          ? event.approval.status
          : '',
      ),
    ).toEqual(['pending', 'approved']);
    expect(events.at(-1)).toEqual({ type: 'completed' });
    await session.close();
  });

  test('accumulates usage across tool-loop steps', async () => {
    const runtime = createTestRuntime();
    const tool: RuntimeTool = {
      name: 'lookup',
      description: 'Look something up.',
      inputSchema: { type: 'object' },
      approval: 'auto',
      async execute() {
        return { value: 42 };
      },
    };
    setModel(
      runtime,
      new MockLanguageModelV3({
        doStream: sequenceStreams([
          toolCallStreamParts(tool.name, 'call-1', {}, v3Usage(4, 1)),
          textStreamParts('Done', v3Usage(6, 3)),
        ]),
      }),
    );
    const session = await runtime.open();

    const events = await collect(session.execute(baseRequest('turn-1', { tools: [tool] })));

    const usageEvents = events.filter((event) => event.type === 'usage');
    expect(usageEvents.length).toBeGreaterThanOrEqual(2);
    const lastUsage = usageEvents.at(-1);
    if (lastUsage?.type !== 'usage') {
      throw new Error('expected usage event');
    }
    // Cumulative across both steps; the last report is authoritative.
    expect(lastUsage.usage.inputTokens).toBe(10);
    expect(lastUsage.usage.outputTokens).toBe(4);
    await session.close();
  });

  test('normalizes an APICallError without leaking url, key, or response body', async () => {
    const runtime = createTestRuntime();
    setModel(
      runtime,
      new MockLanguageModelV3({
        doStream: async () => {
          throw new APICallError({
            message: `Unauthorized ${ERROR_SECRET}`,
            url: 'https://provider.example/v1/chat',
            requestBodyValues: {},
            statusCode: 429,
            isRetryable: true,
          });
        },
      }),
    );
    const session = await runtime.open();

    const events = await collect(session.execute(baseRequest('turn-1')));

    expect(events).toEqual([
      {
        type: 'failed',
        error: {
          code: 'provider_call_error',
          message: 'The model provider call failed.',
          retryable: true,
        },
      },
    ]);
    await session.close();
  });

  test('maps instructions, history, input, and call options onto the provider call', async () => {
    const runtime = createTestRuntime();
    const model = new MockLanguageModelV3({ doStream: streamResult(textStreamParts('Hi')) });
    setModel(runtime, model);
    const session = await runtime.open();

    const request = baseRequest('turn-1', {
      history: [
        { role: 'system', parts: [{ type: 'text', text: 'Prior system note.' }] },
        { role: 'user', parts: [{ type: 'text', text: 'What is in /tmp?' }] },
        {
          role: 'assistant',
          parts: [
            { type: 'reasoning', text: 'I should list the directory.' },
            {
              type: 'tool-call',
              toolCallId: 'call-9',
              toolName: 'list_dir',
              input: { path: '/tmp' },
            },
            { type: 'tool-result', toolCallId: 'call-9', output: ['a.txt'], isError: false },
            { type: 'text', text: 'It contains a.txt.' },
          ],
        },
      ],
      input: [{ type: 'text', text: 'Thanks.' }],
      options: { maxOutputTokens: 99, temperature: 0.3 },
    });
    await collect(session.execute(request));

    expect(model.doStreamCalls).toHaveLength(1);
    const call = model.doStreamCalls[0];
    expect(call?.maxOutputTokens).toBe(99);
    expect(call?.temperature).toBe(0.3);
    expect(call?.prompt.map((message) => message.role)).toEqual([
      'system', // instructions
      'system', // history system note
      'user',
      'assistant', // reasoning + tool call
      'tool', // tool result, recovered tool name
      'assistant', // trailing text
      'user', // turn input
    ]);
    const toolMessage = call?.prompt.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'call-9',
        toolName: 'list_dir',
        output: { type: 'json', value: ['a.txt'] },
      },
    ]);
    await session.close();
  });

  test('a deny-mode tool is reported denied and never executed', async () => {
    const runtime = createTestRuntime();
    let executed = false;
    const tool: RuntimeTool = {
      name: 'wipe_disk',
      description: 'Never allowed.',
      inputSchema: { type: 'object' },
      approval: 'deny',
      async execute() {
        executed = true;
        return null;
      },
    };
    setModel(
      runtime,
      new MockLanguageModelV3({
        doStream: sequenceStreams([
          toolCallStreamParts(tool.name, 'call-1', {}),
          textStreamParts('Understood'),
        ]),
      }),
    );
    const session = await runtime.open();

    const events = await collect(session.execute(baseRequest('turn-1', { tools: [tool] })));

    const toolParts = events
      .filter((event) => event.type === 'part.add' || event.type === 'part.replace')
      .map((event) => event.part)
      .filter((part) => part.type === 'tool');
    expect(toolParts.map((part) => (part.type === 'tool' ? part.state : ''))).toEqual([
      'input-available',
      'denied',
    ]);
    expect(events.some((event) => event.type === 'approval.requested')).toBe(false);
    expect(executed).toBe(false);
    expect(events.at(-1)).toEqual({ type: 'completed' });
    await session.close();
  });
});
