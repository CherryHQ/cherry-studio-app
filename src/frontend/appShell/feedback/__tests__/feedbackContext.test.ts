import {
  feedbackFailureContext,
  feedbackFeatureForRoute,
  feedbackTimestamp,
} from '../feedbackContext';

test('projects only machine rejection details from saved SDK and gateway error envelopes', () => {
  const error = {
    type: 'invalid_request_error',
    code: 'invalid_value',
    param: 'messages[3].private',
    message: 'private prompt',
  };
  for (const body of [error, { error }, { detail: { error } }]) {
    expect(
      feedbackFailureContext({ context: { responseBody: JSON.stringify(body) } }).error,
    ).toMatchObject({
      providerType: 'invalid_request_error',
      providerCode: 'invalid_value',
      parameter: 'messages',
    });
  }
  const unsafe = { ...error, type: 'Bearer secret', code: 'sk-private', param: 'private' };
  expect(
    JSON.stringify(feedbackFailureContext({ context: { responseBody: JSON.stringify(unsafe) } })),
  ).not.toMatch(/providerCode|providerType|parameter|private|Bearer/);
  expect(
    feedbackFailureContext({
      context: {
        responseBody: JSON.stringify({
          error: {
            code: 'invalid_request',
            param: '',
            message: "Unsupported parameter: 'max_tokens'",
          },
        }),
      },
    }).error,
  ).toMatchObject({ providerCode: 'invalid_request', parameter: 'max_tokens' });
  expect(
    feedbackFailureContext({
      source: { layer: 'provider' },
      message: "OpenAI API error (400): Unsupported parameter: 'max_output_tokens'",
    }).error?.parameter,
  ).toBe('max_output_tokens');
  expect(
    feedbackFailureContext({
      source: { layer: 'provider' },
      message: "OpenAI API error (400): 400 Unsupported parameter: 'max_output_tokens'",
    }).error?.parameter,
  ).toBe('max_output_tokens');
  expect(
    feedbackFailureContext({
      source: { layer: 'provider' },
      message: "Azure OpenAI API error (400): 400 Unsupported parameter: 'max_output_tokens'",
    }).error?.parameter,
  ).toBe('max_output_tokens');
  expect(
    feedbackFailureContext({
      source: { layer: 'host' },
      message: "OpenAI API error (400): Unsupported parameter: 'max_output_tokens'",
    }).error?.parameter,
  ).toBeUndefined();
  expect(
    feedbackFailureContext({
      source: { layer: 'provider' },
      message: "OpenAI API error (400): Unsupported parameter: 'private_field'",
    }).error?.parameter,
  ).toBeUndefined();
  const geminiJson = JSON.stringify({
    error: {
      code: 400,
      message: "Unsupported parameter: 'maxOutputTokens'",
      status: 'INVALID_ARGUMENT',
    },
  });
  for (const geminiMessage of [
    geminiJson,
    `[${geminiJson}]`,
    `got status: INVALID_ARGUMENT. ${geminiJson}`,
  ]) {
    expect(
      feedbackFailureContext({
        source: { layer: 'provider' },
        message: geminiMessage,
      }).error,
    ).toMatchObject({
      providerCode: '400',
      providerType: 'INVALID_ARGUMENT',
      parameter: 'maxOutputTokens',
    });
  }
  expect(
    feedbackFailureContext({
      source: { layer: 'host' },
      message: geminiJson,
    }).error,
  ).not.toMatchObject({
    providerCode: '400',
  });
  expect(
    feedbackFailureContext({
      code: 'EXECUTION_FAILED',
      reasonCode: 'quota',
      source: { layer: 'provider', code: 'RATE_LIMITED' },
      context: {
        statusCode: 429,
        responseBody: JSON.stringify({
          error: { code: 'insufficient_quota', type: 'rate_limit_error' },
        }),
      },
    }).error,
  ).toMatchObject({
    sourceCode: 'RATE_LIMITED',
    providerCode: 'insufficient_quota',
    providerType: 'rate_limit_error',
    reason: 'quota',
    statusCode: 429,
  });
});

test('projects failure metadata without copying provider text or request payloads', () => {
  const context = feedbackFailureContext({
    code: 'EXECUTION_FAILED',
    reasonCode: 'rate_limit',
    source: { code: 'rate_limit_exceeded', message: 'private source message' },
    context: {
      statusCode: 429,
      modelId: 'vendor/model-1',
      providerId: 'provider-1',
      responseBody: 'private response',
      headers: { authorization: 'Bearer secret' },
    },
  });
  expect(JSON.parse(JSON.stringify(context))).toEqual({
    modelId: 'vendor/model-1',
    providerId: 'provider-1',
    error: {
      code: 'EXECUTION_FAILED',
      sourceCode: 'rate_limit_exceeded',
      statusCode: 429,
      reason: 'rate_limit',
    },
  });
  expect(
    feedbackFailureContext({
      code: 'a free text error',
      reasonCode: 'guessed reason',
      context: {
        modelId: 'https://private.example/model',
        providerId: 'sk-secret',
        statusCode: 999,
      },
    }),
  ).toEqual({
    modelId: undefined,
    providerId: undefined,
    error: { code: undefined, sourceCode: undefined, reason: undefined, statusCode: undefined },
  });
});

test('maps configuration routes to features without exposing route parameters', () => {
  expect(feedbackFeatureForRoute('/settings/provider/private-provider/model')).toBe('providers');
  expect(feedbackFeatureForRoute('/plugins/mcp/private-server')).toBe('plugins');
  expect(feedbackFeatureForRoute('/settings/device-connections/private-computer')).toBe('desktop');
  expect(feedbackFeatureForRoute('/unrecognized/private-value')).toBe('other');
});

test('normalizes valid incident timestamps and omits absent or corrupt ones', () => {
  expect(feedbackTimestamp('2026-10-27T20:00:00+08:00')).toBe('2026-10-27T12:00:00.000Z');
  expect(feedbackTimestamp('invalid')).toBeUndefined();
  expect(feedbackTimestamp(null)).toBeUndefined();
});
