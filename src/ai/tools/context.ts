import type { ToolExecutionOptions } from 'ai';

import type { RequestContext } from './types';

export function getRequestContext(options: ToolExecutionOptions): RequestContext {
  const context = options.experimental_context;
  if (!isRequestContext(context)) {
    throw new Error('Tool execute called without a valid RequestContext');
  }
  return context;
}

function isRequestContext(value: unknown): value is RequestContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<RequestContext>).requestId === 'string'
  );
}
