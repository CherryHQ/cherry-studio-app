import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, AssistantMessageEvent, Model } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

/** Shared by all credential attempts within one model request. */
export const PI_STREAM_IDLE_TIMEOUT_MS = 120_000;

/**
 * Wrap key failover so switching credentials cannot reset the idle budget. Measure from the
 * call, then reset on content events. Long generations keep the request alive; tool execution
 * is outside this timer. Always return a terminal result, even if the source ignores abort.
 */
export function withPiStreamIdleTimeout(
  streamFn: StreamFn,
  idleMs = PI_STREAM_IDLE_TIMEOUT_MS,
): StreamFn {
  return (model, context, options) => {
    const controller = new AbortController();
    const callerSignal = options?.signal;
    const output = new AssistantMessageEventStream();
    let partial = emptyMessage(model);
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (event: Extract<AssistantMessageEvent, { type: 'done' | 'error' }>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', forwardAbort);
      output.push(event);
      output.end();
    };
    const forwardAbort = () => {
      settle(errorEvent(partial, callerSignal?.reason ?? new Error('Request aborted'), true));
      controller.abort(callerSignal?.reason);
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const error = Object.assign(
          new Error(`The model response timed out after ${idleMs / 1000} seconds without data.`),
          { name: 'TimeoutError', code: 'stream_idle_timeout', retryable: true },
        );
        settle(errorEvent(partial, error));
        controller.abort();
      }, idleMs);
    };

    if (callerSignal?.aborted) {
      forwardAbort();
      return output;
    }
    callerSignal?.addEventListener('abort', forwardAbort, { once: true });
    arm();
    void (async () => {
      try {
        const source = await streamFn(model, context, { ...options, signal: controller.signal });
        if (settled) return;
        for await (const event of source) {
          if (settled) return;
          if (event.type === 'done' || event.type === 'error') {
            settle(event);
            return;
          }
          partial = event.partial;
          output.push(event);
          if (event.type !== 'start') arm();
        }
        if (!settled) throw new Error('The model response ended without a terminal event.');
      } catch (error) {
        settle(errorEvent(partial, error, callerSignal?.aborted));
      }
    })();
    return output;
  };
}

function errorEvent(
  partial: AssistantMessage,
  error: unknown,
  aborted = false,
): Extract<AssistantMessageEvent, { type: 'error' }> {
  const message = error instanceof Error ? error.message : String(error);
  const record =
    error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : undefined;
  const code = record?.code ?? record?.type;
  const reason = aborted ? 'aborted' : 'error';
  return {
    type: 'error',
    reason,
    error: {
      ...partial,
      stopReason: reason,
      errorMessage: message,
      diagnostics: [
        ...(partial.diagnostics ?? []),
        {
          type: 'provider_response_failure',
          timestamp: Date.now(),
          error: {
            name: error instanceof Error ? error.name : 'Error',
            message,
            ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
          },
          details: {
            status: record?.statusCode ?? record?.status,
            body: record?.error ?? record?.body,
            retryable: record?.retryable,
          },
        },
      ],
    },
  };
}

function emptyMessage(model: Model<string>): AssistantMessage {
  return {
    role: 'assistant',
    api: model.api,
    provider: model.provider,
    model: model.id,
    content: [],
    stopReason: 'error',
    timestamp: Date.now(),
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}
