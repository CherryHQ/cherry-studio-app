import type { AssistantMessage } from '@earendil-works/pi-ai';
import { isRetryableAssistantError } from '@earendil-works/pi-ai/utils/retry';

import { traceErrorAttributes, type TraceAttributes } from '../../../observability';

export type PiModelFailureStage = 'configuration' | 'model_resolution' | 'stream';

/** Classify only structured facts. Unknown failures must not acquire a cause from their message. */
function errorCategory(facts: TraceAttributes): string {
  const code = String(facts['error.code'] ?? '').toLowerCase();
  const status = facts['http.status_code'];
  if (
    [
      'insufficient_quota',
      'usage_limit_reached',
      'usage_not_included',
      'subscription_sharing_usage_limit_exceeded',
      'billing_not_active',
      'gousagelimiterror',
      'freeusagelimiterror',
    ].includes(code) ||
    status === 402
  )
    return 'quota';
  if (code === 'stream_idle_timeout') return 'timeout';
  // No response covers every failure before headers, including native timeouts and TLS errors.
  if (['no_response', 'stream_disconnected'].includes(code)) return 'network';
  if (['invalid_api_key', 'authentication_error'].includes(code) || status === 401)
    return 'authentication';
  if (code === 'permission_error' || status === 403) return 'permission';
  if (['rate_limit_exceeded', 'rate_limit_error'].includes(code) || status === 429)
    return 'rate_limit';
  if (status === 408 || status === 504) return 'timeout';
  if (
    ['server_error', 'overloaded_error', 'api_error'].includes(code) ||
    (typeof status === 'number' && status >= 500 && status <= 599)
  )
    return 'provider';
  if (typeof status === 'number' && status >= 400 && status <= 499) return 'request';
  return 'unknown';
}

export function piModelErrorAttributes(
  error: unknown,
  stage: PiModelFailureStage,
): TraceAttributes {
  const facts = traceErrorAttributes(error);
  return { ...facts, 'error.stage': stage, 'error.category': errorCategory(facts) };
}

export function piModelTerminalErrorAttributes(message: AssistantMessage): TraceAttributes {
  if (message.stopReason !== 'error') return {};
  const diagnostic = message.diagnostics?.findLast(
    (entry) =>
      entry.type === 'pi_messages_response_failure' || entry.type === 'provider_response_failure',
  );
  return piModelErrorAttributes(
    {
      name: diagnostic?.error?.name,
      code: diagnostic?.error?.code,
      statusCode: diagnostic?.details?.statusCode ?? diagnostic?.details?.status,
      // Use Pi's existing classifier, including its quota and cancellation rules.
      retryable: isRetryableAssistantError(message),
      origin: 'provider',
    },
    'stream',
  );
}
