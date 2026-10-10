import type { RuntimeError, RuntimeToolResult } from './types';

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
