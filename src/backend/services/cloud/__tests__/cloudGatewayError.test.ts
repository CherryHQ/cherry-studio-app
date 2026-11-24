import { cloudRetryDeadline } from '../cloudGatewayError';

const NOW = Date.parse('2026-01-01T00:00:00Z');

test.each([null, undefined, '', '   ', 'invalid', '-1', '+1', '1.5', '1e2', '9'.repeat(400)])(
  'uses a thirty-second cooldown for an absent or invalid Retry-After: %j',
  (retryAfter) => {
    expect(cloudRetryDeadline(retryAfter, NOW)).toBe(NOW + 30_000);
  },
);

test.each([
  ['45', NOW + 45_000],
  [' 45 ', NOW + 45_000],
  ['Thu, 01 Jan 2026 00:01:00 GMT', NOW + 60_000],
  ['0', NOW],
  ['Wed, 31 Dec 2025 23:59:00 GMT', NOW],
] as const)('preserves a valid server Retry-After: %s', (retryAfter, deadline) => {
  expect(cloudRetryDeadline(retryAfter, NOW)).toBe(deadline);
});
