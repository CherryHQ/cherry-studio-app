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
    },
  });
  expect(JSON.stringify(projected)).not.toMatch(/private|Bearer|endpoint|arguments|result/);
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
