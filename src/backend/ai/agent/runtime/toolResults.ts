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

export function createInterruptedToolResult(reason: string): RuntimeToolResult {
  return { value: { status: 'interrupted', reason }, artifacts: [] };
}
