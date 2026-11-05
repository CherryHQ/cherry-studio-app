import type { AssistantMessage } from '@earendil-works/pi-ai';

import { normalizeAiError } from '@/backend/ai/normalizeAiError';

import type { RuntimeError } from '../types';

/** Adapt Pi's terminal provider facts without deciding their product meaning. */
export function readPiTerminalError(message: AssistantMessage): RuntimeError | undefined {
  if (message.stopReason !== 'error') return undefined;
  const diagnostic = message.diagnostics?.findLast(
    (entry) =>
      entry.type === 'pi_messages_response_failure' || entry.type === 'provider_response_failure',
  );
  // Persisted diagnostics fill a missing code with this runtime placeholder.
  const code =
    diagnostic?.error?.code === undefined || diagnostic.error.code === 'runtime_error'
      ? 'provider_error'
      : String(diagnostic.error.code);
  const body = diagnostic?.details?.body;
  return normalizeAiError(
    {
      code,
      name: diagnostic?.error?.name,
      message: message.errorMessage ?? diagnostic?.error?.message ?? 'The provider request failed.',
      statusCode: diagnostic?.details?.statusCode ?? diagnostic?.details?.status,
      responseBody: typeof body === 'string' ? body : JSON.stringify(body),
      finishReason:
        typeof message.rawStopReason === 'string' ? message.rawStopReason : message.stopReason,
      // A user may retry after fixing configuration; Pi owns automatic retry separately.
      retryable: message.api !== 'cherry-image',
    },
    [],
    { providerId: message.provider, modelId: message.model },
  );
}
