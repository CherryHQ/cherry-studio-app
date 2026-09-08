import type { StreamFn } from '@earendil-works/pi-agent-core';

import { traceErrorAttributes, type TraceSpan } from '../../../observability';

/** Observes the result promise without consuming or replacing Pi's event stream. */
export function tracePiStream(streamFn: StreamFn, parent: TraceSpan | undefined): StreamFn {
  if (!parent) return streamFn;
  return async (model, context, options) => {
    const span = parent.startSpan('pi.generate_content', {
      'gen_ai.request.model': model.id,
      'gen_ai.provider.api': model.api,
      'gen_ai.request.messages_count': context.messages.length,
      'gen_ai.request.tools_count': context.tools?.length ?? 0,
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
                'gen_ai.usage.input_tokens':
                  message.usage.input + message.usage.cacheRead + message.usage.cacheWrite,
                'gen_ai.usage.no_cache_tokens': message.usage.input,
                'gen_ai.usage.output_tokens': message.usage.output,
                'gen_ai.usage.total_tokens': message.usage.totalTokens,
                'gen_ai.usage.cache_read_tokens': message.usage.cacheRead,
                'gen_ai.usage.cache_write_tokens': message.usage.cacheWrite,
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
