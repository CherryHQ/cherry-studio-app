import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import type { AgentRuntime, AgentRuntimeSession, RuntimeEvent } from '../../runtime';
import { runDiagnosticAi } from '../runDiagnosticAi';

const model = {
  id: createUniqueModelId('provider', 'diagnostic-model'),
  providerId: 'provider',
  modelId: 'diagnostic-model',
  name: 'Diagnostic model',
} as Model;

function fixture(execute: AgentRuntimeSession['execute']) {
  const session: AgentRuntimeSession = {
    execute,
    cancel: jest.fn(async () => undefined),
    close: jest.fn(async () => undefined),
    respondApproval: jest.fn(async () => undefined),
  };
  const runtime: AgentRuntime = {
    descriptor: {
      id: 'test',
      name: 'Test',
      capabilities: { tools: true, reasoning: false, attachments: false, approvals: false },
    },
    preflightModel: async () => ({
      contextWindow: 32768,
      maxInputTokens: 28672,
      maxOutputTokens: 4096,
      inputModalities: ['text'],
      supportsTools: true,
    }),
    open: async () => session,
  };
  const controller = new AbortController();
  const read = jest.fn(async () => ({ httpStatus: 401 }));
  const input: Parameters<typeof runDiagnosticAi>[0] = {
    runtime,
    model,
    context: { checks: [] },
    language: 'en-US',
    signal: controller.signal,
    tools: [{ id: 'endpoint', description: 'Read fixed endpoint.', read }],
    onUsage: async () => undefined,
  };
  return { input, session, controller, read };
}

test('uses only the final answer after tool calls and exposes the actual tool evidence', async () => {
  const f = fixture(async function* (request) {
    yield {
      type: 'part.add',
      index: 0,
      part: { id: 'preamble', type: 'text', text: 'Checking the endpoint.', state: 'done' },
    };
    const output = await request.tools[0]!.execute({
      input: {},
      signal: f.controller.signal,
      toolCallId: 'probe',
      turnId: request.turnId,
    });
    yield {
      type: 'part.add',
      index: 1,
      part: {
        id: 'tool',
        type: 'tool',
        toolCallId: 'probe',
        toolRef: request.tools[0]!.ref,
        providerName: 'diagnostic_endpoint',
        displayName: 'Endpoint',
        state: 'output-available',
        output,
      },
    };
    yield {
      type: 'part.add',
      index: 2,
      part: {
        id: 'answer',
        type: 'text',
        text: '{"cause":"Authentication failed.","advice":["Check the key."]}',
        state: 'done',
      },
    };
    yield { type: 'completed' };
  });
  const result = await runDiagnosticAi(f.input);
  expect(result.cause).toBe('Authentication failed.');
  expect(result.evidence).toEqual([
    { id: 'probe', tool: 'endpoint', facts: JSON.stringify({ httpStatus: 401 }, null, 2) },
  ]);
  expect(f.session.close).toHaveBeenCalledTimes(1);
});

test('a ninth tool call stops the run before executing another read', async () => {
  const f = fixture(async function* (request) {
    for (let call = 0; call < 9; call++) {
      await request.tools[0]!.execute({
        input: {},
        signal: f.controller.signal,
        toolCallId: `probe-${call}`,
        turnId: request.turnId,
      });
    }
    yield { type: 'completed' };
  });
  await expect(runDiagnosticAi(f.input)).rejects.toMatchObject({ reason: 'budget' });
  expect(f.read).toHaveBeenCalledTimes(8);
  expect(f.session.cancel).toHaveBeenCalledTimes(1);
  expect(f.session.close).toHaveBeenCalledTimes(1);
});

test('invalid model output is never presented as a successful report', async () => {
  const events: RuntimeEvent[] = [
    {
      type: 'part.add',
      index: 0,
      part: { id: 'answer', type: 'text', text: 'Not a report', state: 'done' },
    },
    { type: 'completed' },
  ];
  const f = fixture(async function* () {
    yield* events;
  });
  await expect(runDiagnosticAi(f.input)).rejects.toMatchObject({ reason: 'invalid_response' });
  expect(f.session.close).toHaveBeenCalledTimes(1);
});
