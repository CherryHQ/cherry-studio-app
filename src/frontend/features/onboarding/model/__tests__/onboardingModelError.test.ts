import { ModelPullTimeoutError } from '@/shared/contracts/models';

import { getOnboardingModelError } from '../onboardingModelError';

test.each([
  [401, 'authentication', 'editConnection'],
  [403, 'permission', 'editConnection'],
  [404, 'endpoint', 'editConnection'],
  [405, 'endpoint', 'editConnection'],
  [408, 'timeout', 'retry'],
  [429, 'rateLimit', 'retry'],
  [500, 'server', 'retry'],
  [503, 'server', 'retry'],
  [504, 'timeout', 'retry'],
  [400, 'unknown', 'retry'],
] as const)('maps HTTP %s to a safe reason and recovery action', (statusCode, reason, action) => {
  expect(
    getOnboardingModelError({
      statusCode,
      message: 'private provider message',
      responseBody: 'private response',
      requestHeaders: { Authorization: 'private credential' },
    }),
  ).toEqual({ reason, action });
});

test('recognizes the workflow timeout and wrapped transport failures', () => {
  expect(getOnboardingModelError(new ModelPullTimeoutError(10_000))).toEqual({
    reason: 'timeout',
    action: 'retry',
  });
  expect(getOnboardingModelError({ cause: new TypeError('Network request failed') })).toEqual({
    reason: 'network',
    action: 'retry',
  });
  expect(getOnboardingModelError({ cause: { code: 'ECONNRESET' } })).toEqual({
    reason: 'network',
    action: 'retry',
  });
});

test('recognizes invalid responses even when the outer HTTP request succeeded', () => {
  expect(
    getOnboardingModelError({ statusCode: 200, cause: { name: 'AI_TypeValidationError' } }),
  ).toEqual({ reason: 'invalidResponse', action: 'retry' });
});

test('does not guess a cause from arbitrary provider text or expose it', () => {
  expect(getOnboardingModelError(new Error('401 invalid key: private credential'))).toEqual({
    reason: 'unknown',
    action: 'retry',
  });
  expect(getOnboardingModelError(null)).toBeNull();
  const cyclic: { cause?: unknown } = {};
  cyclic.cause = cyclic;
  expect(getOnboardingModelError(cyclic)).toEqual({ reason: 'unknown', action: 'retry' });
});
