import type { DiagnosticAgentRequest } from '@/shared/contracts/diagnosticSession';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import {
  RUNTIME_EXECUTION_LIMIT_CODE,
  type AgentRuntime,
  type AgentRuntimeSession,
  type RuntimeEvent,
} from '../../runtime';
import { createDiagnosticAgent } from '../createDiagnosticAgent';
import definition from '../diagnosticAgent.json';

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
  const read = jest.fn(async () => ({
    id: 'endpoint' as const,
    status: 'pass' as const,
    facts: { httpStatus: 401 },
  }));
  const input: DiagnosticAgentRequest = {
    model,
    context: {
      configuration: {
        provider: 'provider',
        model: 'model',
        endpointHost: 'provider.example',
        configurationIssue: null,
        remoteExecution: false,
      },
      checks: [],
      incident: null,
    },
    language: 'en-US',
    signal: controller.signal,
    facts: {
      configuration: async () => input.context.configuration,
      endpoint: read,
      plugins: async () => ({
        enabledCount: 0,
        connectedCount: 0,
        truncated: false,
        connections: [],
      }),
      logs: async () => [],
    },
  };
  const agent = createDiagnosticAgent({ runtime, onUsage: async () => undefined });
  return { input, session, runtime, agent, controller, read };
}

test('uses only the final answer after tool calls and exposes the actual tool evidence', async () => {
  const f = fixture(async function* (request) {
    yield {
      type: 'part.add',
      index: 0,
      part: { id: 'preamble', type: 'text', text: 'Checking the endpoint.', state: 'done' },
    };
    const tool = request.tools.find((tool) => tool.providerName === 'diagnostic_endpoint')!;
    const output = await tool.execute({
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
        toolRef: tool.ref,
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
  const result = await f.agent.run(f.input);
  expect(result.cause).toBe('Authentication failed.');
  expect(result.evidence).toEqual([
    {
      id: 'probe',
      tool: 'endpoint',
      data: { id: 'endpoint', status: 'pass', facts: { httpStatus: 401 } },
    },
  ]);
  expect(f.session.close).toHaveBeenCalledTimes(1);
});

test('presents an execution-layer limit as a diagnostic budget failure', async () => {
  const f = fixture(async function* () {
    yield {
      type: 'failed',
      error: {
        code: RUNTIME_EXECUTION_LIMIT_CODE,
        message: 'The isolated execution budget was exceeded.',
        retryable: false,
      },
    };
  });
  await expect(f.agent.run(f.input)).rejects.toMatchObject({ reason: 'budget' });
  expect(f.session.close).toHaveBeenCalledTimes(1);
});

test('rejects private context fields before opening a model session', async () => {
  const f = fixture(async function* () {
    yield { type: 'completed' };
  });
  const open = jest.spyOn(f.runtime, 'open');
  Object.assign(f.input.context.configuration, { apiKey: 'sk-private' });
  await expect(f.agent.run(f.input)).rejects.toThrow();
  expect(open).not.toHaveBeenCalled();
});

test('bounded evidence has an explicit unavailable result instead of untyped JSON', async () => {
  const f = fixture(async function* (request) {
    await request.tools
      .find((tool) => tool.providerName === 'diagnostic_logs')!
      .execute({
        input: {},
        signal: f.controller.signal,
        toolCallId: 'logs',
        turnId: request.turnId,
      });
    yield {
      type: 'part.add',
      index: 0,
      part: {
        id: 'answer',
        type: 'text',
        text: '{"cause":"Evidence is limited.","advice":["Submit feedback."]}',
        state: 'done',
      },
    };
    yield { type: 'completed' };
  });
  f.input.facts.logs = async () =>
    Array.from({ length: 12 }, () => ({
      schemaVersion: 1 as const,
      capture: 'metadata' as const,
      timestamp: '2026-11-06T00:00:00Z',
      level: 'error' as const,
      module: 'Module',
      message: 'Application error',
      facts: Object.fromEntries(
        [
          'providerId',
          'modelId',
          'requestId',
          'sessionId',
          'turnId',
          'assistantMessageId',
          'serverId',
          'toolCallId',
          'taskKind',
          'operation',
        ].map((key) => [key, 'x'.repeat(160)]),
      ),
    }));
  const result = await f.agent.run(f.input);
  expect(result.evidence).toEqual([{ id: 'logs', tool: 'logs', unavailable: 'result_limit' }]);
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
  await expect(f.agent.run(f.input)).rejects.toMatchObject({ reason: 'invalid_response' });
  expect(f.session.close).toHaveBeenCalledTimes(1);
});

test('the internal definition supplies the prompt, fixed read capabilities and execution policy', async () => {
  const f = fixture(async function* (request) {
    expect(request.instructions).toContain('Answer in zh-CN.');
    expect(request.instructions).not.toMatch(/\{\{[^}]+\}\}/);
    expect(request.instructions).toContain(`Maximum ${definition.limits.toolCalls} tool calls.`);
    expect(request.limits).toEqual({
      modelCalls: definition.limits.modelCalls,
      toolCalls: definition.limits.toolCalls,
    });
    expect(request.options.maxOutputTokens).toBe(definition.limits.outputTokens);
    expect(request.tools.map((tool) => tool.providerName)).toEqual([
      'diagnostic_configuration',
      'diagnostic_endpoint',
      'diagnostic_plugins',
      'diagnostic_logs',
    ]);
    expect(request.tools.every((tool) => tool.effect === 'read' && tool.approval === 'auto')).toBe(
      true,
    );
    yield {
      type: 'part.add',
      index: 0,
      part: {
        id: 'answer',
        type: 'text',
        text: '{"cause":"Evidence is limited.","advice":["Submit feedback."]}',
        state: 'done',
      },
    };
    yield { type: 'completed' };
  });
  f.input.language = 'zh-CN';
  expect(f.agent.timeoutMs).toBe(definition.limits.timeoutMs);
  await f.agent.run(f.input);
});

test('one reusable Agent keeps concurrent memory sessions and evidence independent', async () => {
  const f = fixture(async function* (request) {
    await request.tools
      .find((tool) => tool.providerName === 'diagnostic_endpoint')!
      .execute({
        input: {},
        signal: new AbortController().signal,
        toolCallId: request.turnId,
        turnId: request.turnId,
      });
    yield {
      type: 'part.add',
      index: 0,
      part: {
        id: 'answer',
        type: 'text',
        text: '{"cause":"Check the endpoint.","advice":["Review the connection."]}',
        state: 'done',
      },
    };
    yield { type: 'completed' };
  });
  const sessions: AgentRuntimeSession[] = [];
  jest.spyOn(f.runtime, 'open').mockImplementation(async () => {
    const session = { ...f.session, close: jest.fn(async () => undefined) };
    sessions.push(session);
    return session;
  });
  const [first, second] = await Promise.all([
    f.agent.run(f.input),
    f.agent.run({
      ...f.input,
      signal: new AbortController().signal,
      facts: {
        ...f.input.facts,
        endpoint: async () => ({ id: 'endpoint', status: 'pass', facts: { httpStatus: 200 } }),
      },
    }),
  ]);
  expect(first.evidence).toEqual([
    {
      id: expect.any(String),
      tool: 'endpoint',
      data: { id: 'endpoint', status: 'pass', facts: { httpStatus: 401 } },
    },
  ]);
  expect(second.evidence).toEqual([
    {
      id: expect.any(String),
      tool: 'endpoint',
      data: { id: 'endpoint', status: 'pass', facts: { httpStatus: 200 } },
    },
  ]);
  expect(first.evidence[0]!.id).not.toBe(second.evidence[0]!.id);
  expect(sessions).toHaveLength(2);
  for (const session of sessions) expect(session.close).toHaveBeenCalledTimes(1);
});
