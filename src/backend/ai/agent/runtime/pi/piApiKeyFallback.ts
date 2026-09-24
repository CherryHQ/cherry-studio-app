import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

import {
  emptyAssistantMessage,
  errorRecord,
  hasResponseContent,
  isEmptyContentEvent,
  type PiStreamErrorEvent,
  providerErrorEvent,
} from './piStreamEvents';

/**
 * Serve from `credentials[0]`. When a request fails before any content, try every other
 * credential once in ring order; the one that succeeds serves later tool steps. Only
 * cancellation and HTTP 400, which rejects the request itself, keep the failing credential.
 * A credential that cannot be resolved counts as a failed attempt like any other.
 */
export function withPiApiKeyFallback(credentials: readonly (() => Promise<StreamFn>)[]): StreamFn {
  let activeIndex = 0;
  let active: StreamFn | undefined;

  return (model, context, options) => {
    const output = new AssistantMessageEventStream();
    let started = false;
    let committed = false;
    const buffered: AssistantMessageEvent[] = [];
    let partial = emptyAssistantMessage(model);
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
        let failedCredentials = 0;
        while (true) {
          options?.signal?.throwIfAborted();
          let failure: PiStreamErrorEvent | undefined;
          try {
            active ??= await credentials[activeIndex]();
            options?.signal?.throwIfAborted();
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
            failure = providerErrorEvent(partial, error, options?.signal?.aborted);
          }

          failedCredentials += 1;
          if (
            failedCredentials < credentials.length &&
            !committed &&
            !options?.signal?.aborted &&
            failure.reason === 'error' &&
            !hasResponseContent(failure.error) &&
            !isBadRequest(failure.error)
          ) {
            activeIndex = (activeIndex + 1) % credentials.length;
            active = undefined;
            buffered.length = 0;
            continue;
          }
          emit(failure);
          return;
        }
      } catch (error) {
        emit(providerErrorEvent(partial, error, options?.signal?.aborted));
      } finally {
        output.end();
      }
    })();

    return output;
  };
}

function isBadRequestCode(value: unknown): boolean {
  return (typeof value === 'string' || typeof value === 'number') && String(value) === '400';
}

function isBadRequest(message: AssistantMessage): boolean {
  const diagnostic = message.diagnostics?.findLast(
    (entry) => entry.type === 'provider_response_failure',
  );
  const status = diagnostic?.details?.statusCode ?? diagnostic?.details?.status;
  // An explicit HTTP failure takes precedence over an embedded provider code.
  if (typeof status === 'number' || (typeof status === 'string' && /^\d{3}$/.test(status))) {
    if (Number(status) >= 400) return Number(status) === 400;
  }
  if (isBadRequestCode(diagnostic?.error?.code)) return true;

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
  return [error?.code, error?.status, error?.statusCode].some(isBadRequestCode);
}
