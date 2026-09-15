import type { AiFailureInput } from '@/shared/contracts/aiFailure';

const DEFAULT_EXECUTION_ERROR_MESSAGE = 'The model provider call failed.';
const MAX_EXECUTION_ERROR_MESSAGE_CHARS = 4_000;
const REDACTED_SECRET = '[REDACTED]';
const RETRYABLE_PROVIDER_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

function errorRecord(error: unknown): Record<string, unknown> | undefined {
  return typeof error === 'object' && error !== null
    ? (error as Record<string, unknown>)
    : undefined;
}

function sanitizeErrorText(value: string, secrets: readonly string[], maxChars: number): string {
  const stackStart = value.search(/\n\s+at\s+/);
  let text = (stackStart >= 0 ? value.slice(0, stackStart) : value).trim();

  for (const secret of [...new Set(secrets)].sort((left, right) => right.length - left.length)) {
    if (secret) text = text.replaceAll(secret, REDACTED_SECRET);
  }
  text = text
    .replace(/(bearer\s+)[a-z0-9._~+/=-]+/gi, `$1${REDACTED_SECRET}`)
    .replace(
      /(["']?(?:api[_-]?key|authorization|cookie|password|secret|access[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
      `$1${REDACTED_SECRET}`,
    );

  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

function readErrorStatus(record: Record<string, unknown> | undefined): number | undefined {
  const value = record?.statusCode ?? record?.status;
  const status =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(status) && status >= 100 && status <= 599 ? status : undefined;
}

function isRetryableProviderFailure(
  code: string,
  message: string,
  statusCode: number | undefined,
): boolean {
  const embeddedStatus = message.match(
    /\b(?:status(?: code)?|http|api error)\D{0,12}([1-5]\d{2})\b/iu,
  )?.[1];
  const leadingStatus = message.match(/^\s*([1-5]\d{2})(?=\s|:|$)/u)?.[1];
  const resolvedStatusCode = statusCode ?? Number(embeddedStatus ?? leadingStatus ?? Number.NaN);
  if (
    resolvedStatusCode === 408 ||
    resolvedStatusCode === 409 ||
    resolvedStatusCode === 425 ||
    resolvedStatusCode === 429 ||
    resolvedStatusCode >= 500
  ) {
    return true;
  }
  if (RETRYABLE_PROVIDER_ERROR_CODES.has(code.toUpperCase())) return true;

  return /(?:connection (?:error|failed|reset)|fetch failed|network request failed|premature close|stream (?:closed|ended unexpectedly)|timed? out)/iu.test(
    message,
  );
}

export function normalizeAiError(
  error: unknown,
  secrets: readonly string[] = [],
  model?: { providerId: string; modelId: string },
): AiFailureInput {
  const record = errorRecord(error);
  const rawMessage =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof record?.message === 'string'
          ? record.message
          : '';
  const message = sanitizeErrorText(rawMessage, secrets, MAX_EXECUTION_ERROR_MESSAGE_CHARS);
  const code =
    typeof record?.code === 'string'
      ? sanitizeErrorText(record.code, secrets, 128) || 'runtime_error'
      : 'runtime_error';
  const nameValue =
    error instanceof Error
      ? error.name
      : typeof record?.name === 'string'
        ? record.name
        : undefined;
  const name = nameValue ? sanitizeErrorText(nameValue, secrets, 256) : undefined;
  const statusCode = readErrorStatus(record);
  const finishReason =
    typeof record?.finishReason === 'string'
      ? sanitizeErrorText(record.finishReason, secrets, 256)
      : undefined;
  const responseBody =
    typeof record?.responseBody === 'string'
      ? sanitizeErrorText(record.responseBody, secrets, MAX_EXECUTION_ERROR_MESSAGE_CHARS)
      : undefined;
  const explicitRetryable =
    typeof record?.isRetryable === 'boolean'
      ? record.isRetryable
      : typeof record?.retryable === 'boolean'
        ? record.retryable
        : undefined;
  const retryable = explicitRetryable ?? isRetryableProviderFailure(code, message, statusCode);

  return {
    code,
    message: message || DEFAULT_EXECUTION_ERROR_MESSAGE,
    retryable,
    origin: 'provider',
    ...(name ? { name } : {}),
    ...(model || statusCode !== undefined || finishReason || responseBody
      ? {
          context: {
            ...(statusCode !== undefined ? { statusCode } : {}),
            ...(model ? { providerId: model.providerId, modelId: model.modelId } : {}),
            ...(finishReason ? { finishReason } : {}),
            ...(responseBody ? { responseBody } : {}),
          },
        }
      : {}),
  };
}
