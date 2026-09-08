import type { TraceAttributes } from './types';

const SENSITIVE_KEY =
  /authorization|cookie|credential|password|secret|api.?key|access.?token|refresh.?token|prompt|input|output|body|header/i;

export function sanitizeTraceAttributes(
  attributes: TraceAttributes = {},
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attributes).slice(0, 24)) {
    if (SENSITIVE_KEY.test(key) && !(typeof value === 'number' && /tokens|count|bytes/i.test(key)))
      continue;
    if (typeof value === 'string') result[key.slice(0, 64)] = value.slice(0, 256);
    else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
      result[key.slice(0, 64)] = value;
  }
  return result;
}

/** Error messages, causes, stacks, and response bodies can contain user content or credentials. */
export function traceErrorAttributes(error: unknown): TraceAttributes {
  try {
    if (!error || typeof error !== 'object') return {};
    const source = error as Record<string, unknown>;
    const context =
      source.context && typeof source.context === 'object'
        ? (source.context as Record<string, unknown>)
        : undefined;
    return sanitizeTraceAttributes({
      'error.type': typeof source.name === 'string' ? source.name : undefined,
      'error.code': typeof source.code === 'string' ? source.code : undefined,
      'error.origin': typeof source.origin === 'string' ? source.origin : undefined,
      'error.retryable': typeof source.retryable === 'boolean' ? source.retryable : undefined,
      'http.status_code':
        typeof source.statusCode === 'number'
          ? source.statusCode
          : typeof context?.statusCode === 'number'
            ? context.statusCode
            : undefined,
    });
  } catch {
    return {};
  }
}
