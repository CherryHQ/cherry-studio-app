import type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  JsonObject,
  JsonValue,
  Model,
} from '@earendil-works/pi-ai';
import type { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

import { normalizeAiError } from '@/backend/ai/normalizeAiError';

import { emptyAssistantMessage, providerErrorEvent } from './piStreamEvents';

const CREDENTIAL_FIELD =
  /^(?:api[-_]?key|authorization|proxy-authorization|cookie|set-cookie|password|secret|token|access[-_]?token|refresh[-_]?token)$/i;

/** Sanitize provider diagnostics before Pi commits progress or terminal messages to its history. */
export async function* protectPiDurableStream(
  source: AssistantMessageEventStream,
  model: Model<Api>,
  secrets: readonly string[],
  signal?: AbortSignal,
): AsyncIterable<AssistantMessageEvent> {
  let partial = emptyAssistantMessage(model);
  try {
    for await (const event of source) {
      if (event.type === 'done')
        yield { ...event, message: protectedMessage(event.message, secrets) };
      else if (event.type === 'error')
        yield { ...event, error: protectedMessage(event.error, secrets) };
      else {
        partial = protectedMessage(event.partial, secrets);
        yield { ...event, partial };
      }
    }
  } catch (error) {
    yield protectedError(partial, error, secrets, signal?.aborted ?? false);
  }
}

/** Setup errors have no provider stream, but receive the same bounded, redacted diagnostic shape. */
export async function* piDurableSetupError(
  model: Model<Api>,
  error: unknown,
  secrets: readonly string[],
  aborted = false,
): AsyncIterable<AssistantMessageEvent> {
  yield protectedError(emptyAssistantMessage(model), error, secrets, aborted);
}

function protectedError(
  partial: AssistantMessage,
  error: unknown,
  secrets: readonly string[],
  aborted: boolean,
) {
  const failure = normalizeAiError(error, secrets);
  return providerErrorEvent(
    partial,
    {
      ...failure,
      statusCode: failure.context?.statusCode,
      body: failure.context?.responseBody,
    },
    aborted,
  );
}

function protectedMessage(message: AssistantMessage, secrets: readonly string[]): AssistantMessage {
  if (message.errorMessage === undefined && !message.diagnostics?.length) return message;
  return {
    ...message,
    ...(message.errorMessage !== undefined
      ? { errorMessage: normalizeAiError(message.errorMessage, secrets).message }
      : {}),
    ...(message.diagnostics
      ? {
          diagnostics: message.diagnostics.map((diagnostic) => {
            const failure = diagnostic.error
              ? normalizeAiError(diagnostic.error, secrets)
              : undefined;
            return {
              type: diagnostic.type,
              timestamp: diagnostic.timestamp,
              ...(failure
                ? {
                    error: {
                      message: failure.message,
                      code: failure.code,
                      ...(failure.name ? { name: failure.name } : {}),
                    },
                  }
                : {}),
              ...(diagnostic.details
                ? { details: protectJson(diagnostic.details, secrets) as JsonObject }
                : {}),
            };
          }),
        }
      : {}),
  };
}

function protectJson(value: JsonValue, secrets: readonly string[]): JsonValue {
  if (typeof value === 'string')
    return value.trim() ? normalizeAiError(value, secrets).message : value;
  if (Array.isArray(value)) return value.map((child) => protectJson(child, secrets));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        CREDENTIAL_FIELD.test(key) ? '[REDACTED]' : protectJson(child, secrets),
      ]),
    );
  }
  return value;
}
