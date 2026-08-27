import { classifyAgentFailureReason } from '../agentFailure';

describe('classifyAgentFailureReason', () => {
  test.each([
    [{ code: 'turn_timeout', message: 'generic failure' }, 'timeout'],
    [{ code: 'tool_step_limit_exceeded', message: 'generic failure' }, 'tool_limit'],
    [{ message: 'OpenAI API error (403): access denied' }, 'permission'],
    [{ message: 'HTTP 429', responseBody: '{"type":"insufficient_quota"}' }, 'quota'],
    [{ message: 'maximum context length exceeded' }, 'context_length'],
    [{ message: 'stream ended unexpectedly' }, 'stream_interrupted'],
    [{ message: 'self-signed certificate' }, 'proxy_tls'],
    [{ message: 'MCP transport timed out' }, 'mcp'],
    [{ message: 'request failed', statusCode: 503 }, 'provider_unavailable'],
    [{ message: '503: upstream temporarily unavailable' }, 'provider_unavailable'],
    [{ message: 'Pi Runtime requires an API key from the selected provider.' }, 'auth'],
    [{ message: 'unclassified provider response' }, 'unknown'],
  ] as const)('classifies %o as %s', (facts, expected) => {
    expect(classifyAgentFailureReason(facts)).toBe(expected);
  });

  test('lets region evidence override an embedded HTTP 403', () => {
    expect(
      classifyAgentFailureReason({
        message: 'HTTP 403: service is not available in your region',
      }),
    ).toBe('region');
  });
});
