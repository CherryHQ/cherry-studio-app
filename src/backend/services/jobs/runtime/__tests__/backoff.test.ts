import type { RetryPolicy } from '@/shared/data/api/schemas/jobs';

import { computeBackoff } from '../backoff';

const policy = (overrides: Partial<RetryPolicy>): RetryPolicy => ({
  backoff: 'exponential',
  baseDelayMs: 1000,
  maxAttempts: 3,
  maxDelayMs: 60_000,
  ...overrides,
});

describe('computeBackoff', () => {
  it('returns 0 for the none strategy regardless of attempt', () => {
    expect(computeBackoff(policy({ backoff: 'none' }), 1)).toBe(0);
    expect(computeBackoff(policy({ backoff: 'none' }), 10)).toBe(0);
  });

  it('returns the base delay for the fixed strategy', () => {
    expect(computeBackoff(policy({ backoff: 'fixed' }), 1)).toBe(1000);
    expect(computeBackoff(policy({ backoff: 'fixed' }), 7)).toBe(1000);
  });

  it('clamps the fixed strategy to maxDelayMs', () => {
    expect(computeBackoff(policy({ backoff: 'fixed', baseDelayMs: 90_000 }), 1)).toBe(60_000);
  });

  it('uses the raw base delay for exponential attempt 1', () => {
    expect(computeBackoff(policy({}), 1)).toBe(1000);
  });

  it('doubles per attempt for the exponential strategy', () => {
    expect(computeBackoff(policy({}), 2)).toBe(2000);
    expect(computeBackoff(policy({}), 3)).toBe(4000);
    expect(computeBackoff(policy({}), 4)).toBe(8000);
  });

  it('clamps the exponential strategy to maxDelayMs', () => {
    expect(computeBackoff(policy({}), 20)).toBe(60_000);
  });

  it('treats attempt 0 like attempt 1 (floor at 2^0)', () => {
    expect(computeBackoff(policy({}), 0)).toBe(1000);
  });
});
