import path from 'node:path';

import { FakeRuntime } from '../FakeRuntime';
import type { FakeRuntimeProgram } from '../FakeRuntime';
import type {
  RuntimeDescriptor,
  RuntimeEvent,
  RuntimeExecutionRequest,
  RuntimeJsonValue,
  RuntimeTool,
  RuntimeUsageContext,
} from '../types';
import {
  type ArrangedApprovalRequest,
  type ArrangedErrorRequest,
  type ArrangedRequest,
  type RuntimeConformanceHarness,
  describeRuntimeConformance,
} from './_runtimeConformance';

const ERROR_SECRET = 'sk-live-super-secret-9f83b2';
const TOOL_REF = { source: 'builtin', capabilityId: 'delete-managed-file' } as const;
const TOOL_DISPLAY_NAME = 'Delete managed file';

const USAGE_CONTEXT: RuntimeUsageContext = {
  credentialReceipt: { attribution: 'unknown' },
  modelId: 'fake-model',
  modelName: 'Fake Model',
  pricingSnapshot: null,
  providerId: 'fake-provider',
  providerName: 'Fake Provider',
  reportedCostCurrency: null,
  trustProviderReportedCost: false,
};

function baseRequest(
  turnId: string,
  overrides: Partial<RuntimeExecutionRequest> = {},
): RuntimeExecutionRequest {
  return {
    turnId,
    instructions: 'You are a helpful assistant.',
    model: { providerId: 'fake-provider', modelId: 'fake-model' },
    history: [],
    contextCheckpoint: null,
    input: [{ type: 'text', text: 'Hello.' }],
    tools: [],
    options: {},
    ...overrides,
  };
}

function successProgram(): FakeRuntimeProgram {
  return (controller) => {
    controller.emit({
      type: 'part.add',
      index: 0,
      part: { id: 'text-0', type: 'text', text: '', state: 'streaming' },
    });
    controller.emit({ type: 'text.delta', partId: 'text-0', text: 'Hi' });
    controller.emit({ type: 'text.delta', partId: 'text-0', text: ' there' });
    controller.emit({
      type: 'part.replace',
      part: { id: 'text-0', type: 'text', text: 'Hi there', state: 'done' },
    });
    controller.emit({
      type: 'usage',
      completedAt: 1_000,
      context: USAGE_CONTEXT,
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    });
    controller.emit({ type: 'completed' });
  };
}

const CONFORMANCE_CAPABILITIES: RuntimeDescriptor = {
  id: 'fake',
  name: 'Fake Runtime',
  capabilities: {
    reasoning: true,
    tools: true,
    approvals: true,
    // Attachments unsupported so the unsupported-request scenario is expressible.
    attachments: false,
  },
};

const harness: RuntimeConformanceHarness = {
  createRuntime() {
    return new FakeRuntime({ descriptor: CONFORMANCE_CAPABILITIES });
  },

  arrangeSuccess(runtime, turnId): ArrangedRequest {
    (runtime as FakeRuntime).script(successProgram());
    return { request: baseRequest(turnId) };
  },

  arrangeUnsupported(runtime, turnId): ArrangedRequest | null {
    if (runtime.descriptor.capabilities.attachments) {
      return null;
    }
    // No program is scripted: validation must reject before any program runs.
    return {
      request: baseRequest(turnId, {
        input: [
          { type: 'file', mediaType: 'image/png', name: 'shot.png', uri: 'file:///shot.png' },
        ],
      }),
    };
  },

  arrangeApproval(runtime, turnId): ArrangedApprovalRequest {
    const providerName = 'builtin_delete_file_a1b2';
    const toolCallId = 'call-1';
    const approvalId = 'approval-1';
    const toolInput: RuntimeJsonValue = { fileEntryId: 'file-1' };
    let executed = false;

    const tool: RuntimeTool = {
      ref: TOOL_REF,
      providerName,
      displayName: TOOL_DISPLAY_NAME,
      description: 'Delete a file.',
      inputSchema: { type: 'object' },
      approval: 'ask',
      async execute() {
        executed = true;
        return { value: { deleted: true }, artifacts: [] };
      },
    };

    (runtime as FakeRuntime).script(async (controller) => {
      controller.emit({
        type: 'part.add',
        index: 0,
        part: {
          id: 'tool-0',
          type: 'tool',
          toolCallId,
          toolRef: TOOL_REF,
          providerName,
          displayName: TOOL_DISPLAY_NAME,
          state: 'input-available',
          input: toolInput,
        },
      });
      controller.emit({
        type: 'part.replace',
        part: {
          id: 'tool-0',
          type: 'tool',
          toolCallId,
          toolRef: TOOL_REF,
          providerName,
          displayName: TOOL_DISPLAY_NAME,
          state: 'awaiting-approval',
          input: toolInput,
          approvalId,
        },
      });
      controller.emit({
        type: 'approval.requested',
        approval: {
          id: approvalId,
          turnId: controller.turnId,
          toolCallId,
          toolRef: TOOL_REF,
          displayName: TOOL_DISPLAY_NAME,
          input: toolInput,
          status: 'pending',
        },
      });

      const decision = await controller.waitForApproval(approvalId);
      if (decision === 'approve') {
        controller.emit({
          type: 'approval.resolved',
          approval: {
            id: approvalId,
            turnId: controller.turnId,
            toolCallId,
            toolRef: TOOL_REF,
            displayName: TOOL_DISPLAY_NAME,
            input: toolInput,
            status: 'approved',
          },
        });
        controller.emit({
          type: 'part.replace',
          part: {
            id: 'tool-0',
            type: 'tool',
            toolCallId,
            toolRef: TOOL_REF,
            providerName,
            displayName: TOOL_DISPLAY_NAME,
            state: 'running',
            input: toolInput,
            approvalId,
          },
        });
        const output = await tool.execute({
          input: toolInput,
          signal: controller.signal,
          toolCallId,
        });
        controller.emit({
          type: 'part.replace',
          part: {
            id: 'tool-0',
            type: 'tool',
            toolCallId,
            toolRef: TOOL_REF,
            providerName,
            displayName: TOOL_DISPLAY_NAME,
            state: 'output-available',
            input: toolInput,
            output,
          },
        });
      } else {
        controller.emit({
          type: 'approval.resolved',
          approval: {
            id: approvalId,
            turnId: controller.turnId,
            toolCallId,
            toolRef: TOOL_REF,
            displayName: TOOL_DISPLAY_NAME,
            input: toolInput,
            status: 'denied',
          },
        });
        controller.emit({
          type: 'part.replace',
          part: {
            id: 'tool-0',
            type: 'tool',
            toolCallId,
            toolRef: TOOL_REF,
            providerName,
            displayName: TOOL_DISPLAY_NAME,
            state: 'denied',
            input: toolInput,
            output: {
              value: { status: 'denied', reason: 'The user denied this tool call.' },
              artifacts: [],
            },
          },
        });
      }
      controller.emit({ type: 'completed' });
    });

    return {
      request: baseRequest(turnId, { tools: [tool] }),
      toolRef: TOOL_REF,
      displayName: TOOL_DISPLAY_NAME,
      toolCallId,
      toolExecuted: () => executed,
    };
  },

  arrangeCancellable(runtime, turnId): ArrangedRequest {
    const tool: RuntimeTool = {
      ref: TOOL_REF,
      providerName: 'builtin_delete_file_a1b2',
      displayName: TOOL_DISPLAY_NAME,
      description: 'Delete a managed file.',
      inputSchema: { type: 'object' },
      approval: 'auto',
      execute: async () => ({ value: null, artifacts: [] }),
    };
    (runtime as FakeRuntime).script(async (controller) => {
      controller.emit({
        type: 'part.add',
        index: 0,
        part: { id: 'text-0', type: 'text', text: '', state: 'streaming' },
      });
      controller.emit({ type: 'text.delta', partId: 'text-0', text: 'Working' });
      controller.emit({
        type: 'part.add',
        index: 1,
        part: {
          id: 'tool-0',
          type: 'tool',
          toolCallId: 'call-1',
          toolRef: TOOL_REF,
          providerName: tool.providerName,
          displayName: tool.displayName,
          state: 'running',
          input: { fileEntryId: 'file-1' },
        },
      });
      await new Promise<void>((resolve) => {
        if (controller.signal.aborted) {
          resolve();
          return;
        }
        controller.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });
    return { request: baseRequest(turnId, { tools: [tool] }) };
  },

  arrangeError(runtime, turnId): ArrangedErrorRequest {
    (runtime as FakeRuntime).script(() => {
      // A native provider failure whose message embeds a credential.
      throw new Error(`provider request failed authorization token=${ERROR_SECRET}`);
    });
    return { request: baseRequest(turnId), secret: ERROR_SECRET };
  },

  sourceFiles: [
    path.resolve(__dirname, '../types.ts'),
    path.resolve(__dirname, '../RuntimeEventChannel.ts'),
    path.resolve(__dirname, '../FakeRuntime.ts'),
    path.resolve(__dirname, '../toolResults.ts'),
  ],
};

describe('FakeRuntime conformance', () => {
  describeRuntimeConformance(harness);
});

async function collect(stream: AsyncIterable<RuntimeEvent>): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe('FakeRuntime scripting', () => {
  test('preserves allowlisted fields from an explicitly normalized Runtime error', async () => {
    const runtime = new FakeRuntime().script(() => {
      throw {
        code: 'rate_limit_error',
        message: 'Too many requests.',
        retryable: true,
        origin: 'provider',
        name: 'AI_APICallError',
        context: { statusCode: 429, providerId: 'openai', modelId: 'gpt-test' },
      };
    });
    const session = await runtime.open();

    await expect(collect(session.execute(baseRequest('turn-rich-error')))).resolves.toEqual([
      {
        type: 'failed',
        error: {
          code: 'rate_limit_error',
          message: 'Too many requests.',
          retryable: true,
          origin: 'provider',
          name: 'AI_APICallError',
          context: { statusCode: 429, providerId: 'openai', modelId: 'gpt-test' },
        },
      },
    ]);
    await session.close();
  });

  test('rejects structured text attachments when attachment capability is disabled', async () => {
    const runtime = new FakeRuntime({ descriptor: CONFORMANCE_CAPABILITIES });
    const session = await runtime.open();

    await expect(
      collect(
        session.execute(
          baseRequest('turn-text-attachment', {
            input: [
              {
                fileEntryId: '00000000-0000-7000-8000-000000000001',
                type: 'text-attachment',
                mediaType: 'text/plain',
                name: 'notes.txt',
                text: 'notes',
                truncated: false,
                trust: 'untrusted-user-content',
              },
            ],
          }),
        ),
      ),
    ).resolves.toEqual([
      {
        type: 'failed',
        error: {
          code: 'unsupported_input',
          message: 'This runtime does not support file attachments.',
          retryable: false,
        },
      },
    ]);
    await session.close();
  });

  test('emits an opaque context checkpoint fixture before completion', async () => {
    const runtime = new FakeRuntime();
    runtime.scriptEvents([
      {
        type: 'context.checkpoint',
        checkpoint: { version: 1, anchorTurnId: 'turn-0', payload: { summary: 'Earlier turns.' } },
      },
    ]);
    const session = await runtime.open();

    const events = await collect(session.execute(baseRequest('turn-1')));

    expect(events).toEqual([
      {
        type: 'context.checkpoint',
        checkpoint: { version: 1, anchorTurnId: 'turn-0', payload: { summary: 'Earlier turns.' } },
      },
      { type: 'completed' },
    ]);
    await session.close();
  });

  test('replays a scripted event list in order and appends completed if omitted', async () => {
    const runtime = new FakeRuntime();
    runtime.scriptEvents([
      { type: 'part.add', index: 0, part: { id: 'a', type: 'text', text: '', state: 'streaming' } },
      { type: 'text.delta', partId: 'a', text: 'ok' },
    ]);
    const session = await runtime.open();

    const events = await collect(session.execute(baseRequest('turn-1')));

    expect(events.map((event) => event.type)).toEqual(['part.add', 'text.delta', 'completed']);
    await session.close();
  });

  test('uses a default completed program when no script is queued', async () => {
    const runtime = new FakeRuntime();
    const session = await runtime.open();

    const events = await collect(session.execute(baseRequest('turn-1')));

    expect(events).toEqual([{ type: 'completed' }]);
    await session.close();
  });

  test('rejects a second concurrent execute on the same session', async () => {
    const runtime = new FakeRuntime();
    runtime.script(async (controller) => {
      controller.emit({
        type: 'part.add',
        index: 0,
        part: { id: 'a', type: 'text', text: '', state: 'streaming' },
      });
      await new Promise<void>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });
    const session = await runtime.open();

    const iterator = session.execute(baseRequest('turn-1'))[Symbol.asyncIterator]();
    await iterator.next();

    expect(() => session.execute(baseRequest('turn-2'))).toThrow(/one active execute/);

    await session.close();
  });

  test('ignores events scripted after a terminal event', async () => {
    const runtime = new FakeRuntime();
    runtime.script((controller) => {
      controller.emit({ type: 'completed' });
      controller.emit({
        type: 'part.add',
        index: 0,
        part: { id: 'late', type: 'text', text: 'late', state: 'done' },
      });
      controller.emit({ type: 'failed', error: { code: 'x', message: 'x', retryable: false } });
    });
    const session = await runtime.open();

    const events = await collect(session.execute(baseRequest('turn-1')));

    expect(events).toEqual([{ type: 'completed' }]);
    await session.close();
  });

  test('respondApproval for an unknown approval id is a no-op', async () => {
    const runtime = new FakeRuntime();
    const session = await runtime.open();

    await expect(
      session.respondApproval({ turnId: 'turn-1', approvalId: 'missing', decision: 'approve' }),
    ).resolves.toBeUndefined();

    await session.close();
  });
});
