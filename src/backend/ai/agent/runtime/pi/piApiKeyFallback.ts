import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

type ErrorEvent = Extract<AssistantMessageEvent, { type: 'error' }>;

const API_KEY_ERROR_CODES = new Set([
  '401',
  '429',
  'authentication_error',
  'invalid_api_key',
  'rate_limit_error',
  'rate_limit_exceeded',
  'insufficient_quota',
  'resource_exhausted',
]);

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
    const buffered: AssistantMessageEvent[] = [];
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
      for (const pending of buffered) output.push(pending);
      buffered.length = 0;
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
                if (!committed && isEmptyContentEvent(event)) {
                  buffered.push(event);
                  continue;
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
            !hasResponseContent(failure.error) &&
            isApiKeyFailure(failure.error)
          ) {
            const resolve = fallbacks[nextFallback];
            if (resolve) {
              nextFallback += 1;
              buffered.length = 0;
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

function hasResponseContent(message: AssistantMessage): boolean {
  return message.content.some((block) => {
    if (block.type === 'text') return block.text.length > 0 || !!block.textSignature;
    if (block.type === 'thinking') {
      return block.thinking.length > 0 || !!block.thinkingSignature || !!block.redacted;
    }
    return true;
  });
}

function isEmptyContentEvent(event: AssistantMessageEvent): boolean {
  switch (event.type) {
    case 'text_start':
    case 'thinking_start':
      return !hasResponseContent(event.partial);
    case 'text_delta':
    case 'thinking_delta':
      return event.delta.length === 0 && !hasResponseContent(event.partial);
    case 'text_end':
    case 'thinking_end':
      return event.content.length === 0 && !hasResponseContent(event.partial);
    default:
      return false;
  }
}

function errorRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function isApiKeyErrorCode(value: unknown): boolean {
  return (
    (typeof value === 'string' || typeof value === 'number') &&
    API_KEY_ERROR_CODES.has(String(value).toLowerCase())
  );
}

function isApiKeyFailure(message: AssistantMessage): boolean {
  const diagnostic = message.diagnostics?.findLast(
    (entry) => entry.type === 'provider_response_failure',
  );
  const status = diagnostic?.details?.statusCode ?? diagnostic?.details?.status;
  // An explicit HTTP failure takes precedence over an embedded provider code.
  if (typeof status === 'number' || (typeof status === 'string' && /^\d{3}$/.test(status))) {
    if (Number(status) >= 400) return Number(status) === 401 || Number(status) === 429;
  }
  if (isApiKeyErrorCode(diagnostic?.error?.code)) return true;

  let body = diagnostic?.details?.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return false;
    }
  }
  const record = errorRecord(body);
  const error = errorRecord(record?.error) ?? record;
  return [error?.code, error?.type, error?.status, error?.statusCode].some(isApiKeyErrorCode);
}

function errorEvent(partial: AssistantMessage, error: unknown, aborted = false): ErrorEvent {
  const message = error instanceof Error ? error.message : String(error);
  const record = errorRecord(error);
  const status = record?.statusCode ?? record?.status;
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
        {
          type: 'provider_response_failure',
          timestamp: Date.now(),
          error: {
            message,
            name: error instanceof Error ? error.name : 'Error',
            ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
          },
          details: { status, body: record?.error ?? record?.body },
        },
      ],
    },
  };
}
