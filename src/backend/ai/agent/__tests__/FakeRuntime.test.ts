import path from 'node:path';

import { FakeRuntime } from '../FakeRuntime';
import type { FakeRuntimeProgram } from '../FakeRuntime';
import type {
  RuntimeDescriptor,
  RuntimeEvent,
  RuntimeExecutionRequest,
  RuntimeJsonValue,
  RuntimeTool,
} from '../types';
import {
  type ArrangedApprovalRequest,
  type ArrangedErrorRequest,
  type ArrangedRequest,
  type RuntimeConformanceHarness,
  describeRuntimeConformance,
} from './_runtimeConformance';

const ERROR_SECRET = 'sk-live-super-secret-9f83b2';

function baseRequest(
  turnId: string,
  overrides: Partial<RuntimeExecutionRequest> = {},
): RuntimeExecutionRequest {
  return {
    turnId,
    instructions: 'You are a helpful assistant.',
    model: { providerId: 'fake-provider', modelId: 'fake-model' },
    history: [],
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
    controller.emit({ type: 'usage', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } });
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
    const toolName = 'delete_file';
    const toolCallId = 'call-1';
    const approvalId = 'approval-1';
    const toolInput: RuntimeJsonValue = { path: '/tmp/report.txt' };
    let executed = false;

    const tool: RuntimeTool = {
      name: toolName,
      description: 'Delete a file.',
      inputSchema: { type: 'object' },
      approval: 'ask',
      async execute() {
        executed = true;
        return { deleted: true };
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
          toolName,
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
          toolName,
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
          toolName,
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
            toolName,
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
            toolName,
            state: 'running',
            input: toolInput,
            approvalId,
          },
        });
        const output = await tool.execute(toolInput, {
          signal: controller.signal,
          toolCallId,
        });
        controller.emit({
          type: 'part.replace',
          part: {
            id: 'tool-0',
            type: 'tool',
            toolCallId,
            toolName,
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
            toolName,
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
            toolName,
            state: 'denied',
            input: toolInput,
          },
        });
      }
      controller.emit({ type: 'completed' });
    });

    return {
      request: baseRequest(turnId, { tools: [tool] }),
      toolName,
      toolCallId,
      toolExecuted: () => executed,
    };
  },

  arrangeCancellable(runtime, turnId): ArrangedRequest {
    (runtime as FakeRuntime).script(async (controller) => {
      controller.emit({
        type: 'part.add',
        index: 0,
        part: { id: 'text-0', type: 'text', text: '', state: 'streaming' },
      });
      controller.emit({ type: 'text.delta', partId: 'text-0', text: 'Working' });
      await new Promise<void>((resolve) => {
        if (controller.signal.aborted) {
          resolve();
          return;
        }
        controller.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    });
    return { request: baseRequest(turnId) };
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
