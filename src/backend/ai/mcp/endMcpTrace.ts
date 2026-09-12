import { traceErrorAttributes, type TraceSpan } from '../observability';

/** Capture transport facts before the MCP adapter replaces the error shown to callers. */
export function endMcpTrace(
  span: TraceSpan | undefined,
  error: unknown,
  signal?: AbortSignal,
  timedOut = false,
): void {
  if (!span) return;
  const attributes = traceErrorAttributes(error);
  const category = timedOut
    ? 'timeout'
    : signal?.aborted
      ? 'cancelled'
      : attributes['http.status_code'] !== undefined
        ? 'http'
        : typeof attributes['error.code'] === 'number'
          ? 'protocol'
          : (attributes['error.code'] ?? 'unknown');
  span.end(!timedOut && signal?.aborted ? 'cancelled' : 'error', {
    ...attributes,
    'error.category': category,
  });
}
