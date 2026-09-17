import { classifyAgentFailureReason } from '../agentFailure';

describe('classifyAgentFailureReason', () => {
  test.each([
    [{ code: 'turn_timeout', message: 'generic failure' }, 'timeout'],
    [{ code: 'tool_step_limit_exceeded', message: 'generic failure' }, 'tool_limit'],
    [{ message: 'OpenAI API error (403): access denied' }, 'permission'],
    [{ message: 'HTTP 429', responseBody: '{"type":"insufficient_quota"}' }, 'quota'],
    [
      {
        code: 'forbidden',
        message: 'HTTP 403',
        responseBody: '{"message":"用户额度不足, 剩余额度: $0"}',
      },
      'quota',
    ],
    [{ message: 'maximum context length exceeded' }, 'context_length'],
    [{ message: 'request failed', statusCode: 413 }, 'payload_too_large'],
    [{ message: 'Request body too large' }, 'payload_too_large'],
    [{ message: 'Image exceeds 5 MB maximum' }, 'payload_too_large'],
    [{ message: 'image size exceeds the limit' }, 'payload_too_large'],
    [{ code: 'image_too_large', message: 'Invalid image' }, 'payload_too_large'],
    [{ message: 'Invalid API key', statusCode: 401 }, 'auth'],
    [{ message: 'stream ended unexpectedly' }, 'stream_interrupted'],
    [{ message: 'Connection error.' }, 'network'],
    [{ name: 'APIConnectionError', message: 'Connection error.' }, 'network'],
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
