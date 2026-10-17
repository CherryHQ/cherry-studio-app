import { PluginError } from '@/shared/contracts/plugins';
import { createLogRecord } from '@/shared/core/logger/LoggerService';
import type { TraceSpanRecord } from '@/shared/data/types/trace';

import { projectDiagnosticLog, projectDiagnosticTrace } from '../diagnosticMetadata';
import { projectDiagnosticLine } from '../sourceCollector';

const trace: TraceSpanRecord = {
  schemaVersion: 1,
  revision: 2,
  capture: 'metadata',
  processId: 'process-1',
  traceId: 'a'.repeat(32),
  spanId: 'b'.repeat(16),
  parentSpanId: null,
  name: 'mcp.call_tool',
  context: {},
  attributes: {},
  status: 'error',
  startedAt: 100,
  endedAt: 200,
  durationMs: 100,
};

test('retains useful error facts without free text, credentials, payloads or stack traces', () => {
  const error = Object.assign(
    new PluginError('quota', 'private upstream response', { statusCode: 429 }),
    {
      cause: new Error('private credential'),
      body: 'private response',
    },
  );
  const raw = createLogRecord(
    'error',
    'Uncaught JavaScript exception',
    'Plugin',
    { sessionId: 'session-1' },
    [
      error,
      {
        isFatal: true,
        request: { authorization: 'Bearer private' },
        prompt: 'private chat',
      },
    ],
  );
  const projected = projectDiagnosticLog(raw);
  expect(projected).toMatchObject({
    capture: 'metadata',
    message: 'Uncaught JavaScript exception',
    facts: {
      sessionId: 'session-1',
      isFatal: true,
      'plugin.error.reason': 'quota',
      'http.status_code': 429,
    },
  });
  expect(JSON.stringify(projected)).not.toMatch(/private|stack|cause|body|prompt|Bearer/);
  expect(projectDiagnosticLog({ ...raw, level: 'info' })).toBeUndefined();
  expect(projectDiagnosticLog({ ...raw, message: 'private arbitrary message' })?.message).toBe(
    'Application error',
  );
});

test('retains startup timings through file export while rejecting other info logs and private fields', () => {
  const raw = createLogRecord('info', 'Startup stage', 'Startup', {}, [
    {
      operation: 'startup.service',
      outcome: 'completed',
      serviceName: 'DbService',
      phase: 'gate',
      startupStartedAt: 1000,
      jsEntryStartMs: 200,
      elapsedMs: 500,
      durationMs: 125,
      rnStartupStartMs: 0,
      rnRuntimeStartMs: 10,
      rnBundleEntryStartMs: 80,
      path: '/private/database',
      language: 'private-preference',
      error: new Error('private failure'),
    },
  ]);
  const persisted = projectDiagnosticLog(raw);
  const exported = projectDiagnosticLine(
    { tooLarge: false, data: new TextEncoder().encode(JSON.stringify(persisted)) },
    'logs',
    { fromMs: 0, toMs: Date.now() + 1000 },
  );
  if (!exported || exported === 'malformed') throw new Error('Expected startup metadata');
  const value = JSON.parse(new TextDecoder().decode(exported.data));
  expect(value).toMatchObject({
    level: 'info',
    message: 'Startup stage',
    facts: {
      operation: 'startup.service',
      outcome: 'completed',
      serviceName: 'DbService',
      phase: 'gate',
      startupStartedAt: 1000,
      jsEntryStartMs: 200,
      elapsedMs: 500,
      durationMs: 125,
      rnStartupStartMs: 0,
      rnRuntimeStartMs: 10,
      rnBundleEntryStartMs: 80,
    },
  });
  expect(JSON.stringify(value)).not.toMatch(/private|stack|path|language/);
  expect(projectDiagnosticLog({ ...raw, message: 'arbitrary info' })).toBeUndefined();
  expect(projectDiagnosticLog({ ...raw, module: 'OtherModule' })).toBeUndefined();
});

test('preserves the service and dependency responsible for a startup phase promotion', () => {
  const persisted = projectDiagnosticLog(
    createLogRecord('warn', 'Service promoted to startup gate', 'Lifecycle', {}, [
      {
        operation: 'service.phase.promote',
        serviceName: 'BackgroundReplyRuntime',
        requiredBy: 'RemoteAgentRuntime',
        fromPhase: 'postReady',
        toPhase: 'gate',
      },
    ]),
  );
  expect(projectDiagnosticLog(JSON.parse(JSON.stringify(persisted)))).toMatchObject({
    message: 'Service promoted to startup gate',
    facts: {
      operation: 'service.phase.promote',
      serviceName: 'BackgroundReplyRuntime',
      requiredBy: 'RemoteAgentRuntime',
      fromPhase: 'postReady',
      toPhase: 'gate',
    },
  });
});

test('exports only allowlisted trace fields even if stored metadata contains extra sensitive values', () => {
  const record = {
    ...trace,
    context: { sessionId: 'session-1', requestId: 'sk-private' },
    attributes: {
      'plugin.id': 'feishu',
      'plugin.error.reason': 'access',
      'http.status_code': 403,
      'tool.name': 'list_tasks',
      'error.code': 'Bearer-private',
      'error.stage': 'stream',
      'error.category': 'permission',
      'error.retryable': false,
      'tool.result.status': 'partial',
      endpoint: 'https://private.test',
      'tool.arguments': 'private parameters',
      'tool.result': 'private response',
    },
  };
  const projected = projectDiagnosticTrace(record);
  expect(projected).toMatchObject({
    context: { sessionId: 'session-1' },
    attributes: {
      'plugin.id': 'feishu',
      'plugin.error.reason': 'access',
      'http.status_code': 403,
      'tool.name': 'list_tasks',
      'error.stage': 'stream',
      'error.category': 'permission',
      'error.retryable': false,
      'tool.result.status': 'partial',
    },
  });
  expect(JSON.stringify(projected)).not.toMatch(/private|Bearer|endpoint|arguments/);
  expect(projected?.attributes).not.toHaveProperty(['tool.result']);
  expect(projectDiagnosticTrace({ ...record, name: 'agent.event' })).toBeUndefined();
});

test('uses terminal time for completed requests and start time for unfinished requests', () => {
  const record = { ...trace, startedAt: 100, endedAt: 1500, durationMs: 1400 };
  const range = { fromMs: 1000, toMs: 2000 };
  const line = (value: unknown) => ({
    tooLarge: false,
    data: new TextEncoder().encode(JSON.stringify(value)),
  });
  expect(projectDiagnosticLine(line(record), 'traces', range)).toMatchObject({ timestamp: 1500 });
  expect(
    projectDiagnosticLine(
      line({ ...record, endedAt: undefined, status: 'running' }),
      'traces',
      range,
    ),
  ).toBeUndefined();
});

test.each(['running', 'ok', 'error', 'cancelled'] as const)(
  'exports Pi tool execution records with status %s instead of reporting malformed lines',
  (status) => {
    const record = {
      ...trace,
      name: 'pi.execute_tool',
      status,
      ...(status === 'running' ? { revision: 1, endedAt: undefined, durationMs: undefined } : {}),
      context: { agentId: 'agent-1', sessionId: 'session-1', turnId: 'turn-1' },
      attributes: {
        'tool.name': 'fetch_url',
        'tool.call.id': 'call-1',
        'error.code': 'web_lookup_failed',
        'error.retryable': false,
        'tool.arguments': 'private parameters',
        'tool.result': 'private response',
      },
    };
    const projected = projectDiagnosticLine(
      { tooLarge: false, data: new TextEncoder().encode(JSON.stringify(record)) },
      'traces',
      { fromMs: 0, toMs: 1000 },
    );
    expect(projected).toEqual({
      timestamp: status === 'running' ? 100 : 200,
      data: expect.any(Uint8Array),
    });
    if (!projected || projected === 'malformed') throw new Error('Expected exported tool trace');
    const exported = new TextDecoder().decode(projected.data);
    expect(JSON.parse(exported)).toMatchObject({
      name: record.name,
      status,
      context: record.context,
      attributes: {
        'tool.name': 'fetch_url',
        'tool.call.id': 'call-1',
        'error.code': 'web_lookup_failed',
        'error.retryable': false,
      },
    });
    expect(exported).not.toMatch(/private|arguments|result/);
  },
);

test.each([
  'pi.execute_tool',
  'ai.admission',
  'ai.recovery',
  'ai.suspend',
  'ai.prepare',
  'ai.observe',
  'ai.settlement',
  'ai.checkpoint',
  'ai.turn_state',
  'ai.queue',
])('includes %s in archive lines while still dropping private payload fields', (name) => {
  const record = {
    ...trace,
    name,
    context: { sessionId: 'session-1', turnId: 'turn-1', requestId: 'request-1' },
    attributes: {
      'runtime.name': 'pi-durable',
      'tool.name': 'read_file',
      'tool.call.id': 'call-1',
      'agent.turn.status': 'queued',
      'agent.queue.length': 2,
      'agent.recovery.unfinished_count': 1,
      'error.code': 'SQLITE_FULL',
      'tool.arguments': 'private input',
      'error.stack': 'private stack',
    },
  };
  const projected = projectDiagnosticLine(
    { tooLarge: false, data: new TextEncoder().encode(JSON.stringify(record)) },
    'traces',
    { fromMs: 0, toMs: 1000 },
  );
  expect(projected).toEqual(expect.objectContaining({ timestamp: 200 }));
  if (!projected || projected === 'malformed') throw new Error('Expected an exported trace');
  const exported = JSON.parse(new TextDecoder().decode(projected.data));
  expect(exported).toMatchObject({
    name,
    context: record.context,
    attributes: {
      'runtime.name': 'pi-durable',
      'tool.call.id': 'call-1',
      'agent.turn.status': 'queued',
      'agent.queue.length': 2,
      'agent.recovery.unfinished_count': 1,
      'error.code': 'SQLITE_FULL',
    },
  });
  expect(JSON.stringify(exported)).not.toMatch(/private|arguments|stack/);
});

test('preserves durable failure correlation and retry facts through persistent log reprojection', () => {
  const first = projectDiagnosticLog(
    createLogRecord('warn', 'Pi durable generation retry scheduled', 'PiDurableObserver', {}, [
      {
        sessionId: 'session-1',
        turnId: 'turn-1',
        requestId: 'request-1',
        operation: 'pi.retry',
        retryAttempt: 2,
        toolCallId: 'call-1',
        taskKind: 'pi.generation',
        taskId: 42,
        error: Object.assign(new Error('private upstream response'), { code: 'ETIMEDOUT' }),
        input: 'private chat',
      },
    ]),
  );
  const exported = projectDiagnosticLog(JSON.parse(JSON.stringify(first)));
  expect(exported).toMatchObject({
    message: 'Pi durable generation retry scheduled',
    facts: {
      sessionId: 'session-1',
      turnId: 'turn-1',
      requestId: 'request-1',
      operation: 'pi.retry',
      retryAttempt: 2,
      toolCallId: 'call-1',
      taskKind: 'pi.generation',
      taskId: 42,
      'error.code': 'ETIMEDOUT',
    },
  });
  expect(JSON.stringify(exported)).not.toMatch(/private|stack|input/);
});

test('projects repetition counts and times without accepting payload fields or invalid ranges', () => {
  const record = {
    schemaVersion: 1,
    capture: 'metadata',
    timestamp: new Date(2000).toISOString(),
    level: 'error',
    module: 'HttpTransport',
    message: 'HTTP request failed.',
    facts: {},
    repetition: {
      count: 4,
      firstSeenAt: new Date(1000).toISOString(),
      lastSeenAt: new Date(2000).toISOString(),
      body: 'private body',
    },
  };
  const projected = projectDiagnosticLog(record);
  expect(projected?.repetition).toEqual({
    count: 4,
    firstSeenAt: new Date(1000).toISOString(),
    lastSeenAt: new Date(2000).toISOString(),
  });
  expect(JSON.stringify(projected)).not.toContain('private');
  expect(
    projectDiagnosticLog({ ...record, repetition: { ...record.repetition, count: -1 } })
      ?.repetition,
  ).toBeUndefined();
  expect(
    projectDiagnosticLog({
      ...record,
      repetition: { ...record.repetition, firstSeenAt: new Date(3000).toISOString() },
    })?.repetition,
  ).toBeUndefined();
});
