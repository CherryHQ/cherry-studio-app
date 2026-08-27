import type { RuntimeError, RuntimeToolResult } from './types';

export const TOOL_EXECUTION_ERROR: RuntimeError = {
  code: 'tool_execution_error',
  message: 'The tool failed to execute.',
  retryable: false,
  origin: 'tool',
};

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
