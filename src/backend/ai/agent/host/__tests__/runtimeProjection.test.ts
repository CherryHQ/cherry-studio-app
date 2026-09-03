import { toAgentErrorView, toAgentMessagePart } from '../runtimeProjection';

describe('Runtime output projection', () => {
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
