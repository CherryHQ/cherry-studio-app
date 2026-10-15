import type { AssistantMessage } from '@earendil-works/pi-ai';
import { isRetryableAssistantError } from '@earendil-works/pi-ai/utils/retry';

import type { AiFailureReason } from '@/shared/contracts/aiFailure';
import { classifyAiFailureReason } from '@/shared/utils/aiFailure';

import { traceErrorAttributes, type TraceAttributes } from '../../../observability';

export type PiModelFailureStage = 'configuration' | 'model_resolution' | 'stream';

// Provider codes outside the product table. Adding them to `CODE_REASONS` would override the
// reason the UI currently derives from message text for the same failures.
const DIAGNOSTIC_CODE_REASONS: Readonly<Partial<Record<string, AiFailureReason>>> = {
  api_error: 'provider_unavailable',
  billing_not_active: 'quota',
  freeusagelimiterror: 'quota',
  gousagelimiterror: 'quota',
  // No response covers every failure before headers, including native timeouts and TLS errors.
  no_response: 'network',
  overloaded_error: 'provider_unavailable',
  permission_error: 'permission',
  server_error: 'provider_unavailable',
  stream_disconnected: 'network',
  stream_idle_timeout: 'timeout',
  subscription_sharing_usage_limit_exceeded: 'quota',
  usage_limit_reached: 'quota',
  usage_not_included: 'quota',
};

/** Classify only structured facts. Unknown failures must not acquire a cause from their message. */
function errorCategory(facts: TraceAttributes): AiFailureReason {
  const code = facts['error.code'] === undefined ? undefined : String(facts['error.code']);
  const status = facts['http.status_code'];
  return (
    (code && DIAGNOSTIC_CODE_REASONS[code.toLowerCase()]) ||
    classifyAiFailureReason({
      code,
      message: '',
      statusCode: typeof status === 'number' ? status : undefined,
    })
  );
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
