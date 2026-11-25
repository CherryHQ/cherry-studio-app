import { classifyAgentFailureReason } from '../agentFailure';

describe('classifyAgentFailureReason', () => {
  test.each([
    [{ code: 'tool_step_limit_exceeded', message: 'generic failure' }, 'tool_limit'],
    [{ message: 'OpenAI API error (403): access denied' }, 'permission'],
    [{ code: 'model_not_supported', message: 'generic failure' }, 'model_not_found'],
    [
      {
        code: 'invalid_request_error',
        message: '400 status code',
        responseBody:
          '{"error":{"message":"The requested model is not supported.","code":"model_not_supported","param":"model","type":"invalid_request_error"}}',
        statusCode: 400,
      },
      'model_not_found',
    ],
    [{ message: 'The requested model is not supported.', statusCode: 400 }, 'model_not_found'],
    [{ code: 'invalid_request_error', message: 'Invalid request', statusCode: 400 }, 'unknown'],
    [
      {
        code: 'invalid_request',
        message: '400',
        responseBody: '{"error":{"code":"unsupported_parameter","param":"reasoning_effort"}}',
        statusCode: 400,
      },
      'invalid_input',
    ],
    [
      {
        code: 'invalid_request',
        message: "400 Unsupported parameter: 'max_tokens'",
        statusCode: 400,
      },
      'invalid_input',
    ],
    [
      {
        code: 'invalid_request',
        message: 'Invalid request',
        responseBody: '{"error":{"code":"constructor"}}',
        statusCode: 400,
      },
      'unknown',
    ],
    [
      {
        code: 'billing_not_active',
        message: '429',
        responseBody:
          '{"error":{"type":"rate_limit_error","code":"billing_not_active","message":"Your account is not active, please check your billing details."}}',
        statusCode: 429,
      },
      'quota',
    ],
    [
      {
        code: 'provider_error',
        message: '429',
        responseBody:
          '{"error":{"code":"billing_not_active","type":"rate_limited","message":"Your account is not active"}}',
        statusCode: 429,
      },
      'quota',
    ],
    [
      {
        code: 'RATE_LIMITED',
        message: 'Cloud request failed (429) RATE_LIMITED',
        responseBody: '{"error":{"code":"insufficient_quota"}}',
        statusCode: 429,
      },
      'quota',
    ],
    [{ code: 'RATE_LIMITED', message: 'Request failed' }, 'rate_limit'],
    [
      {
        code: 'insufficient_balance',
        message: '429',
        responseBody:
          '{"error":{"type":"rate_limit_error","code":"insufficient_balance","message":"余额不足"}}',
        statusCode: 429,
      },
      'quota',
    ],
    [
      {
        code: 'forbidden',
        message: '403',
        responseBody:
          '{"error":{"code":"permission_denied","message":"Country, region, or territory not supported"}}',
        statusCode: 403,
      },
      'region',
    ],
    [
      {
        code: 'invalid_request',
        message: '400',
        responseBody: JSON.stringify({
          error: {
            code: 'invalid_request',
            param: '',
            message: "Unsupported parameter: 'max_tokens' is not supported",
          },
        }),
        statusCode: 400,
      },
      'invalid_input',
    ],
    [
      {
        code: 'invalid_request',
        message: "422 Unsupported parameter: 'max_tokens'",
        statusCode: 422,
      },
      'invalid_input',
    ],
    [
      {
        code: 'invalid_request',
        message: "OpenAI API error (400): Unsupported parameter: 'max_output_tokens'",
        statusCode: 400,
      },
      'invalid_input',
    ],
    [
      {
        code: 'invalid_request',
        message: "OpenAI API error (400): 400 Unsupported parameter: 'max_output_tokens'",
        statusCode: 400,
      },
      'invalid_input',
    ],
    [
      {
        code: 'invalid_request',
        message: "Azure OpenAI API error (400): 400 Unsupported parameter: 'max_output_tokens'",
        statusCode: 400,
      },
      'invalid_input',
    ],
    [
      {
        code: 'provider_error',
        message:
          '{"error":{"code":400,"message":"Unsupported parameter: \'maxOutputTokens\'","status":"INVALID_ARGUMENT"}}',
        statusCode: 400,
      },
      'invalid_input',
    ],
    [{ message: 'HTTP 429', responseBody: '{"type":"insufficient_quota"}' }, 'quota'],
    [{ code: 'insufficient_user_quota', message: 'Request failed', statusCode: 403 }, 'quota'],
    [
      {
        code: 'forbidden',
        message: 'HTTP 403',
        responseBody: '{"message":"用户额度不足, 剩余额度: $0"}',
      },
      'quota',
    ],
    [{ message: 'maximum context length exceeded' }, 'context_length'],
    [{ code: 'input_too_long', message: 'Invalid request', statusCode: 400 }, 'context_length'],
    [{ code: ' INPUT_TOO_LONG ', message: 'Request failed' }, 'context_length'],
    [{ code: 'input_too_long_metadata', message: 'Invalid request', statusCode: 400 }, 'unknown'],
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
    [
      {
        code: 'no_response',
        message: 'fetch failed: The certificate for this server is invalid.',
      },
      'proxy_tls',
    ],
    [
      { code: 'no_response', message: 'fetch failed: Unable to connect to the proxy.' },
      'proxy_tls',
    ],
    [{ code: 'no_response', message: 'fetch failed: 似乎已断开与互联网的连接。' }, 'network'],
    [{ code: 'no_response', message: '似乎已断开与互联网的连接。' }, 'network'],
    [{ code: 'no_response', message: '' }, 'network'],
    [{ code: 'stream_disconnected', message: '网络连接已中断。' }, 'network'],
    [{ message: 'MCP transport timed out' }, 'mcp'],
    [{ message: 'request failed', statusCode: 503 }, 'provider_unavailable'],
    [{ message: '503: upstream temporarily unavailable' }, 'provider_unavailable'],
    [{ message: 'Pi Runtime requires an API key from the selected provider.' }, 'auth'],
    [{ code: 'no_response', message: 'Self-signed certificate' }, 'proxy_tls'],
    [{ code: 'no_response', message: 'Request timed out' }, 'timeout'],
    [{ code: 'stream_disconnected', message: 'Stream ended unexpectedly' }, 'stream_interrupted'],
    [{ code: 'server_error', message: 'Quota exhausted' }, 'quota'],
    [{ code: 'server_error', message: 'Request failed' }, 'provider_unavailable'],
    [{ code: 'stream_disconnected', message: 'Request failed' }, 'network'],
    [{ code: 'usage_limit_reached', message: 'Request failed' }, 'quota'],
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

describe('structured safety evidence', () => {
  test.each(
    [
      'content_filter_results',
      'content_policy_metadata',
      'prohibited_content_info',
      'responsible_ai_metadata',
      'output_blocked_metadata',
      'blocked by safety',
      'recitation_metadata',
    ].flatMap((text) =>
      (['name', 'message', 'responseBody'] as const).map((field) => ({ text, field })),
    ),
  )('does not infer safety from $field: $text', ({ text, field }) => {
    expect(classifyAgentFailureReason({ message: 'Request failed', [field]: text })).not.toBe(
      'content_filter',
    );
  });

  test.each([
    'content-filter',
    'content_filter',
    'safety',
    'recitation',
    'PROHIBITED_CONTENT',
    'IMAGE_PROHIBITED_CONTENT',
    'IMAGE_RECITATION',
    'IMAGE_SAFETY',
    'BLOCKLIST',
    'SPII',
  ])('recognizes the exact structured finish %s', (finishReason) => {
    expect(classifyAgentFailureReason({ message: 'Request failed', finishReason })).toBe(
      'content_filter',
    );
  });

  test.each(['content_filter', 'content_policy_violation', 'contentFilter'])(
    'recognizes the explicit safety code %s',
    (code) => {
      expect(classifyAgentFailureReason({ code, message: 'Request failed' })).toBe(
        'content_filter',
      );
    },
  );

  test.each([
    'content_filter_results',
    'prohibited_content_info',
    'IMAGE_OTHER',
    'NO_IMAGE',
    'OTHER',
    'private safety description',
  ])('rejects near-match code and finish %s', (value) => {
    expect(classifyAgentFailureReason({ code: value, finishReason: value, message: '' })).toBe(
      'unknown',
    );
  });
});
