import { isModelPullTimeoutError } from '@/shared/contracts/models';

type ModelListFailureReason =
  | 'authentication'
  | 'permission'
  | 'endpoint'
  | 'rateLimit'
  | 'server'
  | 'timeout'
  | 'network'
  | 'invalidResponse'
  | 'unknown';

const NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ENETUNREACH',
  'EAI_AGAIN',
]);
const NETWORK_ERROR_MESSAGES = new Set([
  'Network request failed',
  'Failed to fetch',
  'fetch failed',
]);
const RESPONSE_ERROR_NAMES = new Set([
  'AI_TypeValidationError',
  'AI_JSONParseError',
  'AI_NoResponseBodyError',
]);

/** Only closed reasons reach the UI; provider messages, response bodies and credentials stay private. */
export function getOnboardingModelError(error: unknown) {
  if (error == null) return null;
  const reason = classifyFailure(error);
  return {
    reason,
    action:
      reason === 'authentication' || reason === 'permission' || reason === 'endpoint'
        ? ('editConnection' as const)
        : ('retry' as const),
  };
}

function classifyFailure(error: unknown): ModelListFailureReason {
  // AI SDK request errors can wrap a parsing or native network error in `cause`.
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    if (isModelPullTimeoutError(current)) return 'timeout';
    const value = current as Record<string, unknown>;
    const status = value.statusCode;
    if (status === 401) return 'authentication';
    if (status === 403) return 'permission';
    if (status === 404 || status === 405) return 'endpoint';
    if (status === 408 || status === 504) return 'timeout';
    if (status === 429) return 'rateLimit';
    if (typeof status === 'number' && status >= 500 && status <= 599) return 'server';
    if (value.name === 'TimeoutError' || value.code === 'ETIMEDOUT') return 'timeout';
    if (typeof value.name === 'string' && RESPONSE_ERROR_NAMES.has(value.name))
      return 'invalidResponse';
    if (
      (typeof value.code === 'string' && NETWORK_ERROR_CODES.has(value.code)) ||
      (typeof value.message === 'string' && NETWORK_ERROR_MESSAGES.has(value.message))
    )
      return 'network';
    current = value.cause;
  }
  return 'unknown';
}
