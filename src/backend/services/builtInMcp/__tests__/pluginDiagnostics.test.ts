import type { TraceRecorder, TraceSpan } from '@/backend/utils/diagnosticTrace';
import { PluginError } from '@/shared/contracts/plugins';

import { recordPluginOperation } from '../pluginDiagnostics';

function fixture() {
  const end = jest.fn();
  const span: TraceSpan = {
    traceId: 'trace',
    spanId: 'span',
    startSpan: () => undefined,
    setAttributes: () => {},
    end,
  };
  const startTrace = jest.fn(() => span);
  const traces: TraceRecorder = { startTrace, flush: async () => {} };
  return { traces, startTrace, end };
}

test('records operation identity and safe failure facts while preserving the original error', async () => {
  const { traces, startTrace, end } = fixture();
  const error = new PluginError('authorization', 'private upstream body', { statusCode: 401 });
  await expect(
    recordPluginOperation(traces, 'github', 'oauth', 'refresh', async () => {
      throw error;
    }),
  ).rejects.toBe(error);
  expect(startTrace).toHaveBeenCalledWith('plugin.refresh', undefined, {
    'plugin.id': 'github',
    'plugin.auth.method': 'oauth',
    'plugin.stage': 'refresh',
  });
  expect(end).toHaveBeenCalledWith(
    'error',
    expect.objectContaining({ 'plugin.error.reason': 'authorization', 'http.status_code': 401 }),
  );
  expect(JSON.stringify([startTrace.mock.calls, end.mock.calls])).not.toMatch(/private|stack/);
});

test('records denied authorization without leaking the returned state or changing it', async () => {
  const { traces, startTrace, end } = fixture();
  const state = { status: 'denied', attemptId: 'private', callbackUrl: 'https://private.test' };
  await expect(
    recordPluginOperation(traces, 'notion', 'oauth', 'callback', async () => state),
  ).resolves.toBe(state);
  expect(end).toHaveBeenCalledWith('error', { 'plugin.state': 'denied' });
  expect(JSON.stringify([startTrace.mock.calls, end.mock.calls])).not.toContain('private');
});

test('diagnostic failures never prevent an operation or replace its failure', async () => {
  const { traces } = fixture();
  traces.startTrace = () => {
    throw new Error('storage unavailable');
  };
  await expect(
    recordPluginOperation(traces, 'feishu', 'user', 'begin', async () => 42),
  ).resolves.toBe(42);
  const error = new PluginError('cancelled', 'Cancelled');
  await expect(
    recordPluginOperation(traces, 'feishu', 'user', 'poll', async () => {
      throw error;
    }),
  ).rejects.toBe(error);
});
