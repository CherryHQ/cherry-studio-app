import { diagnosticIdentifier } from './diagnosticIdentifier';

// Only public protocol parameters may leave the device. Nested/custom keys can be user data.
const REQUEST_PARAMETERS = new Set([
  'model',
  'messages',
  'input',
  'contents',
  'tools',
  'tool_choice',
  'parallel_tool_calls',
  'max_tokens',
  'max_completion_tokens',
  'max_output_tokens',
  'maxOutputTokens',
  'temperature',
  'top_p',
  'top_k',
  'stop',
  'stream',
  'stream_options',
  'store',
  'response_format',
  'reasoning_effort',
  'reasoning',
  'thinking',
  'strict',
  'frequency_penalty',
  'presence_penalty',
  'seed',
]);

const MESSAGE_ROLES = new Set([
  'system',
  'developer',
  'user',
  'assistant',
  'tool',
  'model',
  'function',
]);

/** Keep at most the first and last four roles, as in Desktop's request shape. */
export function summarizeMessageRoles(messages: unknown): string | undefined {
  if (!Array.isArray(messages) || !messages.length) return undefined;
  const role = (message: unknown) => {
    const value = record(message)?.role;
    return typeof value === 'string' && MESSAGE_ROLES.has(value) ? value : 'other';
  };
  const roles =
    messages.length <= 8
      ? messages.map(role)
      : [...messages.slice(0, 4).map(role), 'omitted', ...messages.slice(-4).map(role)];
  return roles.join('|');
}

export function diagnosticMessageRoles(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 90) return undefined;
  const roles = value.split('|');
  return roles.length <= 9 &&
    roles.every((role) => MESSAGE_ROLES.has(role) || role === 'other' || role === 'omitted')
    ? value
    : undefined;
}

export function diagnosticProviderCode(value: unknown): string | undefined {
  const code = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  return typeof code === 'string' && /^[\w.-]{1,80}$/.test(code)
    ? diagnosticIdentifier(code)
    : undefined;
}

export function diagnosticRequestParameter(value: unknown): string | undefined {
  return typeof value === 'string' && REQUEST_PARAMETERS.has(value) ? value : undefined;
}

export function diagnosticGatewayRequestId(value: unknown): string | undefined {
  // Cloud generates 16 random bytes and writes their lowercase hex encoding to X-Request-ID.
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value) ? value : undefined;
}

export function readGatewayRequestId(headers: Headers): string | undefined {
  // A proxied response can append the upstream's header after the gateway's own ID.
  return diagnosticGatewayRequestId(headers.get('x-request-id')?.split(',', 1)[0]?.trim());
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function rejectedParameter(message: unknown): string | undefined {
  if (typeof message !== 'string') return undefined;
  const match =
    /^(?:[\w.-]{1,64}(?:\s+[\w.-]{1,32}){0,3}\s+API error\s*\((?:400|422)\):\s+)?(?:(?:400|422):?\s+)?(?:unsupported|unrecognized|unknown|invalid) (?:parameter|argument):?\s+['"`]([a-z_]+)['"`]/i.exec(
      message.trimStart(),
    );
  return diagnosticRequestParameter(match?.[1]);
}

function envelopeRecord(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) && value.length === 1 ? record(value[0]) : record(value);
}

function parseJsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string') return envelopeRecord(value);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 16_384) return undefined;
  let json = trimmed;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    const wrapped = /^got status:\s*[\w .-]{1,64}\.\s+([[{][\s\S]*)$/i.exec(trimmed);
    if (!wrapped?.[1]) return undefined;
    json = wrapped[1];
  }
  try {
    return envelopeRecord(JSON.parse(json));
  } catch {
    return undefined;
  }
}

/** Both the saved failure and the live request expose the SDK's bounded provider response. */
export function readProviderErrorDiagnostics(
  responseBody: unknown,
  message?: unknown,
): {
  providerCode?: string;
  providerType?: string;
  parameter?: string;
} {
  const root = parseJsonRecord(responseBody) ?? parseJsonRecord(message);
  const detail = record(root?.detail);
  const nestedError = record(root?.error) ?? record(detail?.error);
  const error = nestedError ?? detail ?? root;
  const providerCode = diagnosticProviderCode(error?.code);
  const providerType = diagnosticProviderCode(
    error?.type ??
      (nestedError && typeof nestedError.status === 'string' ? nestedError.status : undefined),
  );
  // Report the public root of a path such as messages[3].content, never its arbitrary suffix.
  const parameter =
    (typeof error?.param === 'string'
      ? diagnosticRequestParameter(error.param.match(/^\w+(?=\.|\[|$)/)?.[0])
      : undefined) ??
    rejectedParameter(error?.message) ??
    rejectedParameter(message) ??
    rejectedParameter(responseBody);
  return {
    ...(providerCode && { providerCode }),
    ...(providerType && { providerType }),
    ...(parameter && { parameter }),
  };
}
