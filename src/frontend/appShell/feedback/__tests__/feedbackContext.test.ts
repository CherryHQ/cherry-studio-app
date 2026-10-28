import {
  feedbackFailureContext,
  feedbackFeatureForRoute,
  feedbackTimestamp,
} from '../feedbackContext';

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
