import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';

import { traceErrorAttributes, type TraceSpan } from '../../../observability';

function terminalErrorFacts(message: AssistantMessage) {
  if (message.stopReason !== 'error') return {};
  const diagnostics = message.diagnostics ?? [];
  for (let index = diagnostics.length - 1; index >= 0; index -= 1) {
    const diagnostic = diagnostics[index];
    if (
      !diagnostic?.error ||
      (diagnostic.type !== 'pi_messages_response_failure' &&
        diagnostic.type !== 'provider_response_failure')
    )
      continue;
    return traceErrorAttributes({
      name: diagnostic.error.name,
      code: diagnostic.error.code,
      statusCode: diagnostic.details?.statusCode ?? diagnostic.details?.status,
      retryable: diagnostic.details?.retryable,
    });
  }
  return {};
}

/** Observes the result promise without consuming or replacing Pi's event stream. */
export function tracePiStream(streamFn: StreamFn, parent: TraceSpan | undefined): StreamFn {
  if (!parent) return streamFn;
  return async (model, context, options) => {
    const span = parent.startSpan('pi.generate_content', {
      'gen_ai.request.model': model.id,
      'gen_ai.provider.id': model.provider,
      'gen_ai.provider.api': model.api,
    });
    try {
      const stream = await streamFn(model, context, options);
      void stream
        .result()
        .then(
          (message) => {
            span?.end(
              message.stopReason === 'aborted'
                ? 'cancelled'
                : message.stopReason === 'error'
                  ? 'error'
                  : 'ok',
              {
                'gen_ai.response.finish_reason': message.stopReason,
                ...terminalErrorFacts(message),
              },
            );
          },
          (error) =>
            span?.end(
              options?.signal?.aborted ? 'cancelled' : 'error',
              traceErrorAttributes(error),
            ),
        )
        .catch(() => {
          // A diagnostic observer failure must not reject an unobserved promise.
          span?.end('error', { 'error.origin': 'trace_observer' });
        });
      return stream;
    } catch (error) {
      span?.end(options?.signal?.aborted ? 'cancelled' : 'error', traceErrorAttributes(error));
      throw error;
    }
  };
}
