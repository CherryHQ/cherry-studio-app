import type { AiRequestError } from '@/shared/contracts/aiFailure';

import type { RuntimeError, RuntimeToolResult } from './types';

/** Persist full display results while avoiding duplicate bodies in the model's compactable history. */
export function toModelToolResult(result: RuntimeToolResult): RuntimeToolResult {
  return {
    value: result.modelValue === undefined ? result.value : result.modelValue,
    artifacts: result.artifacts,
    ...(result.failure ? { failure: result.failure } : {}),
  };
}

export function createDeniedToolResult(reason: string): RuntimeToolResult {
  return { value: { status: 'denied', reason }, artifacts: [] };
}

export function createErrorToolResult(error: RuntimeError): RuntimeToolResult {
  return {
    value: {
      status: 'error',
      error: { code: error.code, message: error.message, retryable: error.retryable },
    },
    artifacts: [],
  };
}

/** Adapt an already normalized image request failure without changing retry policy. */
export function createImageRequestErrorToolResult(
  detail: AiRequestError['detail'],
): RuntimeToolResult {
  const { message, retryable, failure } = detail;
  const error: RuntimeError = {
    code: failure.source.code ?? 'image_generation_failed',
    message,
    retryable,
    origin: failure.source.layer,
    ...(failure.source.name ? { name: failure.source.name } : {}),
    ...(failure.context ? { context: failure.context } : {}),
  };
  return { ...createErrorToolResult(error), failure: { error, scope: 'call' } };
}

export function createInterruptedToolResult(reason: string): RuntimeToolResult {
  return { value: { status: 'interrupted', reason }, artifacts: [] };
}
