import { HttpError } from '@/backend/services/http';
import type { WebSearchFailure } from '@/shared/data/types/webSearch';

import { WebSearchConfigError } from '../WebSearchConfigError';

/** Keep useful diagnostics without passing native errors or stack traces into tool results. */
export function toWebSearchFailure(input: string, error: unknown): WebSearchFailure {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage
    .split(/\n\s+at\s+/)[0]
    .trim()
    .slice(0, 1_000);
  let kind: WebSearchFailure['kind'] = 'unknown';
  if (error instanceof WebSearchConfigError) {
    kind = 'configuration';
  } else if (error instanceof HttpError) {
    if (error.kind !== 'internal' && error.kind !== 'cancelled') kind = error.kind;
  } else if (error instanceof Error && error.name === 'TimeoutError') {
    kind = 'timeout';
  } else if (
    /(?:connection (?:error|failed|reset)|network request failed|fetch failed|socket hang up)/i.test(
      message,
    )
  ) {
    kind = 'network';
  }
  const code =
    error instanceof HttpError || error instanceof WebSearchConfigError ? error.code : undefined;
  return {
    input,
    kind,
    message,
    ...(code ? { code: code.slice(0, 128) } : {}),
    ...(error instanceof HttpError && error.status !== undefined ? { status: error.status } : {}),
  };
}

export function isAbortError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name: string }).name === 'AbortError'
  );
}
