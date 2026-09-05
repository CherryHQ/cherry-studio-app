// Keep aligned with desktop src/main/core/job/runtime/backoff.ts.
import type { RetryPolicy } from '@/shared/data/api/schemas/jobs';

/**
 * Retry delay in ms for the given attempt number.
 *   - `none`: 0
 *   - `fixed`: clamp(baseDelay, maxDelay)
 *   - `exponential`: clamp(base × 2^(attempt-1), maxDelay)
 * Pure function — extracted from the runtime so unit tests can exercise the
 * three branches + clamping without standing up the whole service.
 */
export function computeBackoff(policy: RetryPolicy, attempt: number): number {
  if (policy.backoff === 'none') return 0;
  if (policy.backoff === 'fixed') return Math.min(policy.baseDelayMs, policy.maxDelayMs);
  const exp = policy.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(exp, policy.maxDelayMs);
}
