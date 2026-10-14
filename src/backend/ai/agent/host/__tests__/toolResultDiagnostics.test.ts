import type { RuntimeToolResult } from '../../runtime';
import { toolResultDiagnostics } from '../toolResultDiagnostics';

test.each<{ value: RuntimeToolResult['value']; status: string; outcome: string }>([
  { value: { status: 'error', code: 'package-invalid' }, status: 'error', outcome: 'error' },
  { value: { status: 'partial', results: ['private page'] }, status: 'error', outcome: 'partial' },
  {
    value: { status: 'choose', skills: ['private skill'] },
    status: 'ok',
    outcome: 'choice_required',
  },
  { value: { status: 'requires_user_action' }, status: 'ok', outcome: 'requires_user_action' },
  { value: { status: 'installed', name: 'private skill' }, status: 'ok', outcome: 'ok' },
  { value: { status: 'ok', result: { status: 'error' } }, status: 'ok', outcome: 'ok' },
])('projects built-in $outcome without changing the model result', ({ value, status, outcome }) => {
  const output: RuntimeToolResult = { value, artifacts: [] };
  const before = JSON.stringify(output);
  const diagnostic = toolResultDiagnostics(
    { source: 'builtin', capabilityId: 'install_skill' },
    output,
  );
  expect(diagnostic).toMatchObject({ status, attributes: { 'tool.result.status': outcome } });
  expect(JSON.stringify(diagnostic)).not.toContain('private');
  expect(JSON.stringify(output)).toBe(before);
  expect(output.failure).toBeUndefined();
});

test('claims no result status for external tool data', () => {
  const ref = { source: 'mcp', serverId: 'server', rawToolName: 'read_record' } as const;
  const value = { status: 'error', code: 'private-code', retryable: true };
  expect(toolResultDiagnostics(ref, { value, artifacts: [] })).toEqual({
    status: 'ok',
    attributes: {},
  });
  expect(
    toolResultDiagnostics(ref, {
      value,
      artifacts: [],
      failure: {
        scope: 'call',
        error: { code: 'mcp_tool_call_failed', message: 'private failure', retryable: true },
      },
    }),
  ).toEqual({
    status: 'error',
    attributes: { 'error.code': 'mcp_tool_call_failed', 'error.retryable': true },
  });
});

test('retains trusted failures and partial success without copying payloads', () => {
  const diagnostic = toolResultDiagnostics(
    { source: 'builtin', capabilityId: 'fetch_url' },
    {
      value: { status: 'partial', code: 'untrusted-code', results: ['private page'] },
      artifacts: [],
      failure: {
        scope: 'tool',
        error: { code: 'web_lookup_failed', message: 'private failure', retryable: false },
      },
    },
  );
  expect(diagnostic).toEqual({
    status: 'error',
    attributes: {
      'tool.result.status': 'partial',
      'error.code': 'web_lookup_failed',
      'error.retryable': false,
    },
  });
});
