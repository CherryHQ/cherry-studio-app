import type { ToolExecutionOptions } from 'ai';

import type { RequestContext } from './types';

export function getRequestContext<TAssistant = unknown>(
  options: ToolExecutionOptions,
): RequestContext<TAssistant> {
  const context = options.experimental_context;
  if (!isRequestContext<TAssistant>(context)) {
    throw new Error('Tool execute called without a valid RequestContext');
  }
  return context;
}

function isRequestContext<TAssistant>(value: unknown): value is RequestContext<TAssistant> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<RequestContext>).requestId === 'string'
  );
}
