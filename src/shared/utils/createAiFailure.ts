import { AiFailureSnapshotSchema, type AiFailureInput } from '@/shared/contracts/aiFailure';

import { classifyAiFailureReason } from './aiFailure';

const MAX_ERROR_CODE_CHARS = 128;
const MAX_ERROR_MESSAGE_CHARS = 4_000;
const MAX_ERROR_CONTEXT_CHARS = 4_000;

function bounded(value: string, maxChars: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars - 1)}…` : trimmed;
}

function boundedOptional(value: string | undefined, maxChars: number): string | undefined {
  if (value === undefined) return undefined;
  return bounded(value, maxChars) || undefined;
}

/**
 * Preserve bounded diagnostic facts in a versioned, JSON-safe snapshot.
 */
export function createAiFailure(error: AiFailureInput) {
  const code = bounded(error.code, MAX_ERROR_CODE_CHARS) || 'runtime_error';
  const message = bounded(error.message, MAX_ERROR_MESSAGE_CHARS) || 'The Agent turn failed.';
  const rawStatusCode = error.context?.statusCode;
  const statusCode =
    typeof rawStatusCode === 'number' &&
    Number.isSafeInteger(rawStatusCode) &&
    rawStatusCode >= 100 &&
    rawStatusCode <= 599
      ? rawStatusCode
      : undefined;
  const providerId = boundedOptional(error.context?.providerId, 256);
  const modelId = boundedOptional(error.context?.modelId, 256);
  const finishReason = boundedOptional(error.context?.finishReason, 256);
  const responseBody = boundedOptional(error.context?.responseBody, MAX_ERROR_CONTEXT_CHARS);
  const context = {
    ...(statusCode !== undefined ? { statusCode } : {}),
    ...(providerId !== undefined ? { providerId } : {}),
    ...(modelId !== undefined ? { modelId } : {}),
    ...(finishReason !== undefined ? { finishReason } : {}),
    ...(responseBody !== undefined ? { responseBody } : {}),
  };
  const name = boundedOptional(error.name, 256);
  const failure = AiFailureSnapshotSchema.parse({
    version: 1,
    reasonCode: classifyAiFailureReason({
      code,
      message,
      ...(name !== undefined ? { name } : {}),
      ...(statusCode !== undefined ? { statusCode } : {}),
      ...(finishReason !== undefined ? { finishReason } : {}),
      ...(responseBody !== undefined ? { responseBody } : {}),
    }),
    source: {
      layer: error.origin ?? 'runtime',
      code,
      ...(name !== undefined ? { name } : {}),
    },
    ...(Object.keys(context).length > 0 ? { context } : {}),
  });

  return {
    message,
    retryable: error.retryable,
    failure,
  };
}
