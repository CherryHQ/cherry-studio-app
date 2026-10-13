import { traceErrorAttributes, type TraceAttributes } from '@/backend/utils/diagnosticTrace';

import type { RuntimeToolRef, RuntimeToolResult } from '../runtime';

/** Project app-owned result envelopes for diagnostics only; never change execution failure policy. */
export function toolResultDiagnostics(
  ref: RuntimeToolRef,
  output: RuntimeToolResult,
): { status: 'ok' | 'error'; attributes: TraceAttributes } {
  // MCP payloads are arbitrary user data, not the built-in tools' result contract. Their outcome
  // is recorded by the MCP adapter; claim nothing about it here.
  if (ref.source !== 'builtin')
    return {
      status: output.failure ? 'error' : 'ok',
      attributes: traceErrorAttributes(output.failure?.error),
    };
  const value =
    output.value !== null && typeof output.value === 'object' && !Array.isArray(output.value)
      ? output.value
      : undefined;
  const outcome =
    value?.status === 'partial'
      ? 'partial'
      : output.failure || value?.status === 'error'
        ? 'error'
        : value?.status === 'choose'
          ? 'choice_required'
          : value?.status === 'requires_user_action'
            ? 'requires_user_action'
            : 'ok';
  const failed = outcome === 'error' || outcome === 'partial';
  return {
    status: failed ? 'error' : 'ok',
    attributes: {
      'tool.result.status': outcome,
      ...traceErrorAttributes(
        output.failure?.error ??
          (failed
            ? {
                code: typeof value?.code === 'string' ? value.code : 'tool_result_error',
                retryable: value?.retryable,
                origin: 'tool',
              }
            : undefined),
      ),
    },
  };
}
