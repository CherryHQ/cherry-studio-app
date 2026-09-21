import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

type ErrorEvent = Extract<AssistantMessageEvent, { type: 'error' }>;

/** Keep the working credential across tool steps, and never replay emitted content. */
export function withPiApiKeyFallback(
  primary: StreamFn,
  fallbacks: readonly (() => Promise<StreamFn>)[],
): StreamFn {
  if (fallbacks.length === 0) return primary;

  let active = primary;
  let nextFallback = 0;
  let exhausted: ErrorEvent | undefined;

  return (model, context, options) => {
    const output = new AssistantMessageEventStream();
    let started = false;
    let committed = false;
    let partial: AssistantMessage = {
      role: 'assistant',
      api: model.api,
      provider: model.provider,
      model: model.id,
      content: [],
      stopReason: 'stop',
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
    const emit = (event: AssistantMessageEvent) => {
      if (!started) {
        output.push({ type: 'start', partial });
        started = true;
      }
      output.push(event);
    };

    void (async () => {
      try {
        while (true) {
          options?.signal?.throwIfAborted();
          let failure = exhausted;
          if (!failure) {
            try {
              const source = await active(model, context, options);
              for await (const event of source) {
                options?.signal?.throwIfAborted();
                partial =
                  event.type === 'done'
                    ? event.message
                    : event.type === 'error'
                      ? event.error
                      : event.partial;
                if (event.type === 'start') continue;
                if (event.type === 'error') {
                  failure = event;
                  break;
                }
                committed = true;
                emit(event);
                if (event.type === 'done') return;
              }
              if (!failure) throw new Error('The model response ended without a terminal event.');
            } catch (error) {
              failure = errorEvent(partial, error, options?.signal?.aborted);
            }
          }

          if (
            !committed &&
            !options?.signal?.aborted &&
            failure.reason === 'error' &&
            failure.error.content.length === 0 &&
            isApiKeyFailure(failure.error)
          ) {
            const resolve = fallbacks[nextFallback];
            if (resolve) {
              nextFallback += 1;
              active = await resolve();
              continue;
            }
            exhausted = failure;
          }
          emit(failure);
          return;
        }
      } catch (error) {
        emit(errorEvent(partial, error, options?.signal?.aborted));
      } finally {
        output.end();
      }
    })();

    return output;
  };
}

function isApiKeyFailure(message: AssistantMessage): boolean {
  const diagnostic = message.diagnostics?.findLast(
    (entry) => entry.type === 'provider_response_failure',
  );
  const status = diagnostic?.details?.statusCode ?? diagnostic?.details?.status;
  return status === 401 || status === 429;
}

function errorEvent(partial: AssistantMessage, error: unknown, aborted = false): ErrorEvent {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    error && typeof error === 'object'
      ? 'statusCode' in error
        ? error.statusCode
        : 'status' in error
          ? error.status
          : undefined
      : undefined;
  const reason = aborted ? 'aborted' : 'error';
  return {
    type: 'error',
    reason,
    error: {
      ...partial,
      stopReason: reason,
      errorMessage: message,
      diagnostics: [
        {
          type: 'provider_response_failure',
          timestamp: Date.now(),
          error: { message, name: error instanceof Error ? error.name : 'Error' },
          details: { status },
        },
      ],
    },
  };
}
