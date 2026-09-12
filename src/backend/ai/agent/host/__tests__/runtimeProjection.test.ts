import type { AgentMessageView } from '@/shared/contracts/agent';

import { toAgentErrorView, toAgentMessagePart } from '../runtimeProjection';
import { toRuntimeHistory } from '../turnRuntimeInput';

describe('Runtime output projection', () => {
  test('persists callback failure details and replays partial sources without runtime stop policy', () => {
    const details = {
      status: 'partial',
      results: [
        { id: 'source-1', title: 'Available', url: 'https://example.com/a', content: 'Body' },
      ],
      failures: [
        { input: 'https://example.com/b', kind: 'http', status: 404, message: 'Not found' },
      ],
    };
    const error = {
      code: 'web_lookup_failed',
      message: 'Jina: page B not found',
      retryable: false,
    };
    const part = toAgentMessagePart({
      displayName: 'Fetch web page',
      id: 'tool-call-1',
      providerName: 'web_fetch',
      state: 'error',
      toolCallId: 'call-1',
      toolRef: { source: 'builtin', capabilityId: 'web_fetch' },
      type: 'tool',
      error,
      output: { value: details, artifacts: [], failure: { scope: 'tool', error } },
    });
    const output = { value: { status: 'error', error, details }, artifacts: [] };
    expect(part).toMatchObject({ state: 'error', output });
    if (part.type !== 'tool') throw new Error('Expected a tool part');
    expect(part.output).not.toHaveProperty('failure');

    const message: AgentMessageView = {
      id: 'assistant-1',
      sessionId: 'session-1',
      turnId: 'turn-1',
      role: 'assistant',
      status: 'success',
      parts: [part],
      usage: null,
      stats: null,
      modelId: null,
      inferenceSnapshot: null,
      createdAt: '2026-09-07T00:00:00Z',
      updatedAt: '2026-09-07T00:00:00Z',
    };
    expect(
      toRuntimeHistory([JSON.parse(JSON.stringify(message))])[0].messages[0].parts,
    ).toContainEqual({
      type: 'tool-result',
      toolCallId: 'call-1',
      isError: true,
      output,
    });
  });

  test('preserves the tool input-streaming lifecycle state', () => {
    expect(
      toAgentMessagePart({
        displayName: 'Write file',
        id: 'tool-call-1',
        providerName: 'write_file',
        state: 'input-streaming',
        toolCallId: 'call-1',
        toolRef: { source: 'builtin', capabilityId: 'write_file' },
        type: 'tool',
      }),
    ).toMatchObject({ state: 'input-streaming', type: 'tool' });
  });

  test('preserves provider identity behind the closed protocol error code', () => {
    expect(
      toAgentErrorView({
        code: 'access_denied',
        message: 'OpenAI API error (403): access denied',
        retryable: false,
        origin: 'provider',
        name: 'AI_APICallError',
        context: {
          statusCode: 403,
          providerId: 'openai',
          modelId: 'gpt-test',
          responseBody: '{"error":"access_denied"}',
        },
      }),
    ).toEqual({
      code: 'EXECUTION_FAILED',
      message: 'OpenAI API error (403): access denied',
      retryable: false,
      failure: {
        version: 1,
        reasonCode: 'permission',
        source: { layer: 'provider', name: 'AI_APICallError', code: 'access_denied' },
        context: {
          statusCode: 403,
          providerId: 'openai',
          modelId: 'gpt-test',
          responseBody: '{"error":"access_denied"}',
        },
      },
    });
  });
});
