import type { StreamFn } from '@earendil-works/pi-agent-core';

import { traceErrorAttributes, type TraceSpan } from '../../../observability';

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
