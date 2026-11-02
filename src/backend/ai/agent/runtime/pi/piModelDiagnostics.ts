import type { Api, AssistantMessage, TranscriptContext } from '@earendil-works/pi-ai';
import { estimateContextTokens } from '@earendil-works/pi-ai/utils/estimate';
import { isRetryableAssistantError } from '@earendil-works/pi-ai/utils/retry';
import { getCurrentTools } from '@earendil-works/pi-ai/utils/transcript';

import type { AiFailureReason } from '@/shared/contracts/aiFailure';
import { classifyAiFailureReason, readKnownAiFinishReason } from '@/shared/utils/aiFailure';

import { traceErrorAttributes, type TraceAttributes } from '../../../observability';
import type { PiModelResolution } from './piModelTypes';

export type PiModelFailureStage = 'configuration' | 'model_resolution' | 'stream';

// Diagnostic-only classifications. Product failures may still use provider text, while a body
// disconnect keeps the broader network category here and stream_interrupted in the UI.
const DIAGNOSTIC_CODE_REASONS: Readonly<Partial<Record<string, AiFailureReason>>> = {
  api_error: 'provider_unavailable',
  billing_not_active: 'quota',
  freeusagelimiterror: 'quota',
  gousagelimiterror: 'quota',
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
function errorCategory(facts: TraceAttributes, finishReason?: string): AiFailureReason {
  const code = facts['error.code'] === undefined ? undefined : String(facts['error.code']);
  const status = facts['http.status_code'];
  return (
    (code && DIAGNOSTIC_CODE_REASONS[code.toLowerCase()]) ||
    classifyAiFailureReason({
      code,
      message: '',
      finishReason,
      statusCode: typeof status === 'number' ? status : undefined,
    })
  );
}

export function piModelErrorAttributes(
  error: unknown,
  stage: PiModelFailureStage,
  finishReason?: string,
): TraceAttributes {
  const facts = traceErrorAttributes(error);
  return { ...facts, 'error.stage': stage, 'error.category': errorCategory(facts, finishReason) };
}

export function piModelTerminalErrorAttributes(message: AssistantMessage): TraceAttributes {
  if (message.stopReason !== 'error') return {};
  const diagnostic = message.diagnostics?.findLast(
    (entry) =>
      entry.type === 'pi_messages_response_failure' || entry.type === 'provider_response_failure',
  );
  return {
    ...piModelErrorAttributes(
      {
        name: diagnostic?.error?.name,
        code: diagnostic?.error?.code,
        statusCode: diagnostic?.details?.statusCode ?? diagnostic?.details?.status,
        // Use Pi's existing classifier, including its quota and cancellation rules.
        retryable: isRetryableAssistantError(message),
        origin: 'provider',
      },
      'stream',
      readKnownAiFinishReason(message.rawStopReason),
    ),
    'error.retry_scope': 'automatic',
  };
}

/** Reuse Pi's context estimate; it is not the provider's measured input token count. */
export function piModelRequestAttributes(
  { model, maxInputTokens }: Pick<PiModelResolution, 'model' | 'maxInputTokens'>,
  context: TranscriptContext,
  maxTokens: number,
): TraceAttributes {
  try {
    const estimate = estimateContextTokens(context);
    return {
      'gen_ai.model.context_window': model.contextWindow,
      'gen_ai.model.max_input_tokens': maxInputTokens,
      'gen_ai.model.max_output_tokens': model.maxTokens,
      'gen_ai.request.output_budget_tokens': maxTokens,
      'gen_ai.request.estimated_input_tokens': estimate.tokens,
      'gen_ai.request.estimate_source':
        estimate.lastUsageIndex === null ? 'pi_estimate' : 'pi_usage_and_estimate',
      'gen_ai.request.message_count': context.messages.length,
      'gen_ai.request.tool_count': getCurrentTools(context.messages).length,
    };
  } catch {
    // Diagnostics cannot turn an otherwise usable request into a failure.
    return {};
  }
}

/** Read only the output cap after all application payload transforms. Never retain the body. */
export function piModelPayloadAttributes(payload: unknown, api: Api): TraceAttributes {
  if (!payload || typeof payload !== 'object') return {};
  const body = payload as Record<string, unknown>;
  const config =
    body.config && typeof body.config === 'object'
      ? (body.config as Record<string, unknown>)
      : undefined;
  const field =
    api === 'google-generative-ai' || api === 'google-vertex'
      ? 'config.maxOutputTokens'
      : api === 'openai-responses' || api === 'azure-openai-responses'
        ? 'max_output_tokens'
        : api === 'openai-completions' && body.max_completion_tokens !== undefined
          ? 'max_completion_tokens'
          : 'max_tokens';
  const limit = field === 'config.maxOutputTokens' ? config?.maxOutputTokens : body[field];
  return {
    'gen_ai.request.max_tokens': typeof limit === 'number' ? limit : undefined,
    'gen_ai.request.max_tokens_field': limit === undefined ? 'omitted' : field,
  };
}
