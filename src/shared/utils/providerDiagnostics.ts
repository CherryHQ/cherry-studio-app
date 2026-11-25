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
    /^(?:(?:[\w.-]{1,64}\s+API error\s*\((?:400|422)\):|(?:400|422):?)\s+)?(?:unsupported|unrecognized|unknown|invalid) (?:parameter|argument):?\s+['"`]([a-z_]+)['"`]/i.exec(
      message.trimStart(),
    );
  return diagnosticRequestParameter(match?.[1]);
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
  let body = responseBody;
  if (typeof body === 'string') {
    try {
      body = body.length <= 16_384 ? JSON.parse(body) : undefined;
    } catch {
      body = undefined;
    }
  }
  const root = record(body);
  const detail = record(root?.detail);
  const error = record(root?.error) ?? record(detail?.error) ?? detail ?? root;
  const providerCode = diagnosticProviderCode(error?.code);
  const providerType = diagnosticProviderCode(error?.type);
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
